var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl
var inboxSym = require('../../utils/icons').inboxSym

var TYPE_META = {
  friend_request: { label: '好友申请', color: '#34D399' },
  recommendation: { label: '推荐', color: '#FBB924' },
  card_share: { label: '名片转发', color: '#5B8DEF' },
  system: { label: '系统', color: '#9499B0' },
  task_notify: { label: '任务', color: '#5B8DEF' },
  activity_notify: { label: '活动', color: '#A78BFA' },
  task_share: { label: '任务转发', color: '#5B8DEF' },
  activity_share: { label: '活动转发', color: '#A78BFA' }
}

function enrichMessage(m) {
  var meta = TYPE_META[m.type] || TYPE_META.system
  var summary = m.content || ''
  if (summary.length > 56) summary = summary.slice(0, 56) + '…'
  var actionHint = ''
  if (m.type === 'card_share') actionHint = '点击查看名片'
  else if (m.type === 'friend_request') actionHint = '前往通讯录处理'
  else if (m.type === 'task_notify' || m.type === 'task_share') actionHint = '查看任务'
  else if (m.type === 'activity_notify' || m.type === 'activity_share') actionHint = '查看活动'
  return Object.assign({}, m, {
    typeLabel: meta.label,
    iconSym: inboxSym(m.type),
    typeColor: meta.color,
    summary: summary,
    actionHint: actionHint
  })
}

function enrichConversation(c) {
  var colors = avatarColors(c.user_id)
  var last = c.last_message || ''
  if (last.length > 40) last = last.slice(0, 40) + '…'
  var time = c.last_time || ''
  if (time.length > 16) time = time.slice(0, 16).replace('T', ' ')
  return {
    user_id: c.user_id,
    name: c.name || '',
    nameAbbr: (c.name || '').slice(0, 2),
    last_message: last,
    last_time: time,
    unread_count: c.unread_count || 0,
    avatarUrl: resolveAvatarUrl(c.avatar_url),
    avatarBg: colors.bg,
    avatarC: colors.c
  }
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 24,
    mainTab: 0,
    messages: [],
    conversations: [],
    unreadCount: 0,
    dmUnreadTotal: 0,
    loading: true,
    dmLoading: false,
    loadError: '',
    dmLoadError: '',
    refreshing: false
  },

  onLoad: function () {
    this.setData(layout.getPageInsets())
  },

  onShow: function () {
    this._loadNotify()
    this._refreshDmUnread()
    if (this.data.mainTab === 1) {
      this._loadConversations()
    }
  },

  onPullDownRefresh: function () {
    var self = this
    this.setData({ refreshing: true })
    if (this.data.mainTab === 0) {
      this._loadNotify(function () {
        self.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
    } else {
      this._loadConversations(function () {
        self.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
    }
  },

  switchMainTab: function (e) {
    var n = parseInt(e.currentTarget.dataset.n, 10)
    var self = this
    this.setData({ mainTab: n }, function () {
      if (n === 1) self._loadConversations()
    })
  },

  _loadNotify: function (done) {
    var self = this
    this.setData({ loading: !this.data.refreshing, loadError: '' })
    api.inbox.list({ page: 1, page_size: 50 }).then(function (data) {
      var items = (data.items || []).map(enrichMessage)
      self.setData({
        messages: items,
        unreadCount: data.unread_count || 0,
        loading: false
      })
      if (done) done()
    }).catch(function (err) {
      self.setData({
        loading: false,
        loadError: (err && err.message) || '加载失败',
        messages: []
      })
      if (done) done()
    })
  },

  _refreshDmUnread: function () {
    var self = this
    api.messages.unreadCount().then(function (data) {
      self.setData({ dmUnreadTotal: (data && data.total) || 0 })
    }).catch(function () {
      self.setData({ dmUnreadTotal: 0 })
    })
  },

  _loadConversations: function (done) {
    var self = this
    this.setData({ dmLoading: !this.data.refreshing, dmLoadError: '' })
    Promise.all([
      api.messages.conversations(),
      api.messages.unreadCount().catch(function () { return { total: 0 } })
    ]).then(function (results) {
      var convData = results[0]
      var unreadData = results[1]
      var items = (convData.items || []).map(enrichConversation)
      self.setData({
        conversations: items,
        dmUnreadTotal: unreadData.total || 0,
        dmLoading: false
      })
      if (done) done()
    }).catch(function (err) {
      self.setData({
        dmLoading: false,
        dmLoadError: (err && err.message) || '加载失败',
        conversations: []
      })
      if (done) done()
    })
  },

  markAllRead: function () {
    var self = this
    if (this.data.mainTab !== 0) return
    if (!this.data.unreadCount) {
      wx.showToast({ title: '暂无未读消息', icon: 'none' })
      return
    }
    api.inbox.markAllRead().then(function () {
      var msgs = (self.data.messages || []).map(function (m) {
        return Object.assign({}, m, { is_read: true })
      })
      self.setData({ messages: msgs, unreadCount: 0 })
      wx.showToast({ title: '已全部已读', icon: 'success' })
    }).catch(function () {})
  },

  openConversation: function (e) {
    var userId = parseInt(e.currentTarget.dataset.userId, 10)
    var userName = e.currentTarget.dataset.name || ''
    if (!userId) return
    wx.navigateTo({
      url: '/pages/chat/chat?userId=' + userId + '&userName=' + encodeURIComponent(userName)
    })
  },

  openMessage: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var type = e.currentTarget.dataset.type
    var idx = parseInt(e.currentTarget.dataset.idx, 10)
    if (!id) return

    var relatedId = parseInt(e.currentTarget.dataset.related, 10)
    var item = self.data.messages[idx]

    var navigate = function () {
      if (type === 'card_share' && relatedId) {
        wx.setStorageSync('qm_open_user_id', relatedId)
        wx.switchTab({ url: '/pages/contacts/contacts' })
      } else if (type === 'friend_request' || type === 'recommendation') {
        wx.switchTab({ url: '/pages/contacts/contacts' })
      } else if (type === 'task_notify' || type === 'task_share') {
        var taskId = parseInt((item && (item.related_id != null ? item.related_id : item.related)) || relatedId, 10)
        if (taskId) wx.setStorageSync('qm_open_task_id', taskId)
        wx.switchTab({ url: '/pages/tasks/tasks' })
      } else if (type === 'activity_notify' || type === 'activity_share') {
        var actId = parseInt((item && (item.related_id != null ? item.related_id : item.related)) || relatedId, 10)
        if (actId) wx.setStorageSync('qm_open_activity_id', actId)
        wx.switchTab({ url: '/pages/tasks/tasks' })
      }
    }

    var wasUnread = item && !item.is_read

    var afterRead = function () {
      var msgs = self.data.messages.slice()
      if (msgs[idx]) msgs[idx] = Object.assign({}, msgs[idx], { is_read: true })
      self.setData({
        messages: msgs,
        unreadCount: wasUnread ? Math.max(0, self.data.unreadCount - 1) : self.data.unreadCount
      })
      navigate()
    }

    if (item && item.is_read) {
      navigate()
      return
    }

    api.inbox.markRead(id).then(afterRead).catch(afterRead)
  },

  goBack: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/contacts/contacts' }) } })
  }
})
