var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl

function formatChatTime(isoStr) {
  if (!isoStr) return ''
  var d = new Date(String(isoStr).replace(' ', 'T'))
  if (isNaN(d.getTime())) {
    return String(isoStr).slice(0, 16).replace('T', ' ')
  }
  var now = new Date()
  var pad = function (n) { return n < 10 ? '0' + n : '' + n }
  var hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  var sameDay = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  var isYesterday = d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (sameDay) return hm
  if (isYesterday) return '昨天 ' + hm
  if (d.getFullYear() === now.getFullYear()) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
  }
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
}

function minutesGap(prevIso, curIso) {
  if (!prevIso || !curIso) return 999
  var a = new Date(String(prevIso).replace(' ', 'T')).getTime()
  var b = new Date(String(curIso).replace(' ', 'T')).getTime()
  if (isNaN(a) || isNaN(b)) return 999
  return Math.abs(b - a) / 60000
}

function buildAvatarMeta(userId, name, avatarUrl) {
  var colors = avatarColors(userId || 0)
  return {
    avatarUrl: resolveAvatarUrl(avatarUrl),
    nameAbbr: (name || '').slice(0, 2) || '?',
    avatarBg: colors.bg,
    avatarC: colors.c
  }
}

function enrichMessages(items, peerMeta, myMeta) {
  var out = []
  var prevCreated = null
  for (var i = 0; i < items.length; i++) {
    var m = items[i] || {}
    var showTime = !prevCreated || minutesGap(prevCreated, m.created_at) > 5
    var av = m.is_mine ? myMeta : peerMeta
    out.push({
      id: m.id,
      content: m.content || '',
      is_mine: !!m.is_mine,
      showTime: showTime,
      timeLabel: formatChatTime(m.created_at),
      avatarUrl: av.avatarUrl,
      nameAbbr: av.nameAbbr,
      avatarBg: av.avatarBg,
      avatarC: av.avatarC
    })
    prevCreated = m.created_at || prevCreated
  }
  return out
}

Page({
  data: {
    statusBarHeight: 20,
    safeBottom: 0,
    userId: 0,
    userName: '',
    peerAvatarUrl: '',
    peerNameAbbr: '',
    peerAvatarBg: '#1e2434',
    peerAvatarC: '#5cb8ff',
    messages: [],
    inputText: '',
    canSend: false,
    scrollIntoView: '',
    loading: true,
    sending: false
  },

  onLoad: function (options) {
    var app = getApp()
    var userId = parseInt(options.userId, 10) || 0
    var userName = options.userName ? decodeURIComponent(options.userName) : ''
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      safeBottom: app.globalData.safeBottom || 0,
      userId: userId,
      userName: userName || ('用户 #' + userId)
    })
    if (!userId) {
      wx.showToast({ title: '无效会话', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 800)
    }
  },

  onShow: function () {
    var self = this
    if (this.data.userId) this._loadMessages()
    if (this._pollTimer) clearInterval(this._pollTimer)
    this._pollTimer = setInterval(function () {
      if (!self.data.loading && !self.data.sending) self._loadMessages()
    }, 5000)
  },

  onHide: function () {
    clearInterval(this._pollTimer)
  },

  onUnload: function () {
    if (this._pollTimer) clearInterval(this._pollTimer)
    // 返回消息列表/通讯录时刷新未读角标
    var pages = getCurrentPages()
    if (pages.length < 2) return
    var prev = pages[pages.length - 2]
    if (!prev || typeof prev._refreshDmUnread !== 'function') return
    prev._refreshDmUnread()
    if (typeof prev._refreshInboxUnread === 'function') prev._refreshInboxUnread()
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () {
        wx.navigateTo({ url: '/pages/inbox/inbox' })
      }
    })
  },

  onInput: function (e) {
    var val = e.detail.value || ''
    this.setData({
      inputText: val,
      canSend: !!val.trim()
    })
  },

  _getMyMeta: function () {
    var app = getApp()
    var me = app.globalData.user || {}
    return buildAvatarMeta(me.id, me.name, me.avatar_url)
  },

  _scrollToBottom: function () {
    var msgs = this.data.messages || []
    var target = msgs.length ? 'msg-' + msgs[msgs.length - 1].id : 'chat-bottom-anchor'
    var self = this
    this.setData({ scrollIntoView: '' }, function () {
      self.setData({ scrollIntoView: target })
    })
  },

  _loadMessages: function () {
    var self = this
    var userId = this.data.userId
    if (!userId) return
    this.setData({ loading: true })
    api.messages.conversation(userId).then(function (data) {
      var peer = data.peer || {}
      var peerName = peer.name || self.data.userName
      var peerMeta = buildAvatarMeta(peer.id || userId, peerName, peer.avatar_url)
      var myMeta = self._getMyMeta()
      var items = enrichMessages(data.items || [], peerMeta, myMeta)
      self.setData({
        messages: items,
        loading: false,
        userName: peerName,
        peerAvatarUrl: peerMeta.avatarUrl,
        peerNameAbbr: peerMeta.nameAbbr,
        peerAvatarBg: peerMeta.avatarBg,
        peerAvatarC: peerMeta.avatarC
      }, function () {
        self._scrollToBottom()
      })
    }).catch(function (err) {
      self.setData({ loading: false, messages: [] })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  sendMsg: function () {
    var self = this
    if (self.data.sending || !self.data.canSend) return
    var content = (self.data.inputText || '').trim()
    if (!content) {
      wx.showToast({ title: '请输入消息', icon: 'none' })
      return
    }
    var userId = self.data.userId
    if (!userId) return
    self.setData({ sending: true })
    api.messages.send(userId, content).then(function () {
      var myMeta = self._getMyMeta()
      var msgs = self.data.messages.slice()
      msgs.push({
        id: Date.now(),
        content: content,
        is_mine: true,
        showTime: false,
        timeLabel: '',
        avatarUrl: myMeta.avatarUrl,
        nameAbbr: myMeta.nameAbbr,
        avatarBg: myMeta.avatarBg,
        avatarC: myMeta.avatarC
      })
      self.setData({
        messages: msgs,
        inputText: '',
        canSend: false,
        sending: false
      })
      self._scrollToBottom()
    }).catch(function (err) {
      self.setData({ sending: false })
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    })
  }
})
