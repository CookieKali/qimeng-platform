var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl

var HISTORY_KEY = 'qm_search_history'
var MAX_HISTORY = 10

var TASK_STATUS_CLS = {
  open: 'pg',
  in_progress: 'pa',
  completed: 'pb',
  cancelled: 'pgr'
}

function enrichUser(u) {
  var colors = avatarColors(u.id)
  return {
    id: u.id,
    name: u.name || '',
    job: u.job_title || '',
    co: u.company || '',
    nameAbbr: (u.name || '').slice(0, 2),
    bg: colors.bg,
    c: colors.c,
    bc: colors.bc,
    avatarUrl: resolveAvatarUrl(u.avatar_url)
  }
}

function enrichTask(t) {
  return {
    id: t.id,
    title: t.title || '',
    creditsStr: String(t.credits || 0),
    status: t.status || 'open',
    statusLabel: t.status_label || t.status || '',
    statusCls: TASK_STATUS_CLS[t.status] || 'pb'
  }
}

function enrichActivity(a) {
  return {
    id: a.id,
    title: a.title || '',
    date: a.start_at || '',
    location: a.location || ''
  }
}

function loadHistory() {
  try {
    var raw = wx.getStorageSync(HISTORY_KEY)
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

function saveHistory(keyword) {
  var kw = (keyword || '').trim()
  if (!kw) return
  var list = loadHistory().filter(function (item) { return item !== kw })
  list.unshift(kw)
  if (list.length > MAX_HISTORY) list = list.slice(0, MAX_HISTORY)
  wx.setStorageSync(HISTORY_KEY, list)
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 24,
    keyword: '',
    searched: false,
    loading: false,
    history: [],
    users: [],
    tasks: [],
    activities: [],
    total: 0,
    inputFocus: true
  },

  onLoad: function () {
    this.setData(Object.assign({}, layout.getPageInsets(), { history: loadHistory() }))
  },

  onShow: function () {
    this.setData({ history: loadHistory() })
  },

  onCancel: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/contacts/contacts' }) } })
  },

  onInput: function (e) {
    this.setData({ keyword: e.detail.value })
  },

  onConfirm: function () {
    this.doSearch(this.data.keyword)
  },

  onHistoryTap: function (e) {
    var kw = e.currentTarget.dataset.kw
    this.setData({ keyword: kw })
    this.doSearch(kw)
  },

  clearHistory: function () {
    wx.removeStorageSync(HISTORY_KEY)
    this.setData({ history: [] })
  },

  doSearch: function (keyword) {
    var self = this
    var kw = (keyword || '').trim()
    if (!kw) {
      wx.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }
    saveHistory(kw)
    this.setData({
      keyword: kw,
      searched: true,
      loading: true,
      history: loadHistory(),
      users: [],
      tasks: [],
      activities: [],
      total: 0
    })
    api.search.query(kw).then(function (data) {
      self.setData({
        loading: false,
        users: (data.users || []).map(enrichUser),
        tasks: (data.tasks || []).map(enrichTask),
        activities: (data.activities || []).map(enrichActivity),
        total: data.total || 0
      })
    }).catch(function () {
      self.setData({ loading: false, users: [], tasks: [], activities: [], total: 0 })
    })
  },

  openUser: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.setStorageSync('qm_open_user_id', id)
    wx.switchTab({ url: '/pages/contacts/contacts' })
  },

  openTask: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (id) wx.setStorageSync('qm_open_task_id', id)
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  openActivity: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (id) wx.setStorageSync('qm_open_activity_id', id)
    wx.switchTab({ url: '/pages/tasks/tasks' })
  }
})
