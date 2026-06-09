var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var api = apiModule.api
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl
var creditLvClass = apiModule.creditLvClass
var LABELS = ['全部', '即将开始', '进行中', '已结束']
var KEYS = ['all', 'upcoming', 'ongoing', 'ended']
var TYPE_CLASS = { '闭门沙龙': 'pp', '行业论坛': 'pt', '工作坊': 'pa', '资源对接': 'pc' }

function getActivityStatus(startAt, endAt, activityStatus) {
  if (activityStatus === 'cancelled') return 'cancelled'
  if (activityStatus === 'finished') return 'ended'
  if (!startAt) return 'upcoming'
  var d = new Date(startAt)
  var now = new Date()
  var diff = (d - now) / 86400000
  if (diff > 0.5) return 'upcoming'
  if (diff >= -0.5) {
    if (endAt) {
      var endDate = new Date(endAt)
      if (now <= endDate) return 'ongoing'
    } else {
      return 'ongoing'
    }
  }
  return 'ended'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  var d = new Date(dateStr)
  var year = d.getFullYear()
  var month = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  var hour = String(d.getHours()).padStart(2, '0')
  var minute = String(d.getMinutes()).padStart(2, '0')
  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute
}

function enrichActivity(a, mySignupIds) {
  var status = getActivityStatus(a.start_at, a.end_at, a.status)
  var statusLabels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束', cancelled: '已取消' }
  var statusCls = { upcoming: 'pg', ongoing: 'pa', ended: 'pgr', cancelled: 'pgr' }
  var isJoined = mySignupIds.indexOf(a.id) !== -1
  var date = a.start_at ? formatDate(a.start_at) : ''
  var type = a.type || '活动'
  return {
    id: a.id,
    title: a.title || '',
    date: date,
    space: a.location || '',
    type: type,
    typeClass: TYPE_CLASS[type] || 'pb',
    seats: a.capacity || 0,
    desc: a.description || '',
    host_name: a.host_name || '',
    signups: a.signups || 0,
    status: status,
    statusLabel: statusLabels[status] || '即将开始',
    statusCls: statusCls[status] || 'pg',
    isJoined: isJoined,
    coverUrl: resolveAvatarUrl(a.cover_url),
    displayOrder: a.display_order || 0
  }
}

function enrichAttendee(item, myId) {
  var colors = avatarColors(item.id)
  return Object.assign({}, item, {
    bg: colors.bg,
    c: colors.c,
    bc: colors.bc,
    nameAbbr: item.nameAbbr || (item.name || '').slice(0, 2),
    avatarUrl: resolveAvatarUrl(item.avatar_url),
    creditLv: 'A',
    creditLvClass: creditLvClass('A'),
    isMe: item.is_me || item.id === myId
  })
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    actSub: 0,
    subLabel: '全部',
    displayActivities: [],
    _allActivities: [],
    _mySignupIds: [],
    modal: null,
    selectedActivity: null,
    myChecked: false,
    attendees: [],
    attendeesExpired: false,
    attendeesTotal: 0,
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    shareMode: '',
    shareActivityId: 0
  },

  onLoad: function (options) {
    this.setData(layout.getPageInsets())
    if (options && options.id) {
      this._pendingActivityId = parseInt(options.id, 10)
    }
  },

  onShow: function () {
    if (this._pendingActivityId) {
      var pid = this._pendingActivityId
      this._pendingActivityId = null
      this._openActivityById(pid)
      return
    }
    this._resetAndLoad()
  },

  _resetAndLoad: function () {
    this.setData({
      page: 1,
      hasMore: true,
      _allActivities: [],
      displayActivities: []
    })
    this._load()
  },

  _openActivityById: function (activityId) {
    var self = this
    this.setData({ loading: true })
    Promise.all([
      api.activities.list(),
      api.activities.mySignups().catch(function () { return { ids: [] } }),
      api.activities.detail(activityId).catch(function () { return null })
    ]).then(function (results) {
      var listData = results[0]
      var signupData = results[1]
      var detail = results[2]
      var mySignupIds = signupData.ids || []
      var all = (listData.items || []).map(function (a) {
        return enrichActivity(a, mySignupIds)
      })
      self.setData({ _allActivities: all, _mySignupIds: mySignupIds, loading: false })
      self._applyFilter()
      var target = null
      for (var i = 0; i < all.length; i++) {
        if (Number(all[i].id) === Number(activityId)) {
          target = all[i]
          break
        }
      }
      if (!target && detail) {
        target = enrichActivity(detail, mySignupIds)
      }
      if (target) {
        self.showActivityDetail(target)
      } else {
        wx.showToast({ title: '活动不存在', icon: 'none' })
      }
    }).catch(function () {
      self.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  _load: function () {
    var self = this
    var isFirstLoad = this.data.page === 1
    
    if (isFirstLoad) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    Promise.all([
      api.activities.list({
        status: LABELS[this.data.actSub],
        page: this.data.page,
        page_size: this.data.pageSize
      }),
      api.activities.mySignups().catch(function () { return { ids: [] } })
    ]).then(function (results) {
      var data = results[0]
      var signupData = results[1]
      var mySignupIds = signupData.ids || []
      var newActivities = (data.items || []).map(function (a) {
        return enrichActivity(a, mySignupIds)
      })
      
      var allActivities = isFirstLoad ? newActivities : self.data._allActivities.concat(newActivities)
      var hasMore = data.page < (data.total_pages || 1)
      
      self.setData({
        _allActivities: allActivities,
        _mySignupIds: mySignupIds,
        loading: false,
        loadingMore: false,
        hasMore: hasMore
      })
      self._applyFilter()
    }).catch(function () {
      self.setData({ loading: false, loadingMore: false })
    })
  },

  _applyFilter: function () {
    var actSub = this.data.actSub
    var all = this.data._allActivities || []
    var key = KEYS[actSub]
    var list = key === 'all' ? all : all.filter(function (a) { return a.status === key })
    this.setData({ displayActivities: list, subLabel: LABELS[actSub] })
  },

  switchSub: function (e) {
    var n = parseInt(e.currentTarget.dataset.n, 10)
    this.setData({ actSub: n }, function () {
      this._resetAndLoad()
    })
  },

  onReachBottom: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
      return
    }
    var nextPage = this.data.page + 1
    this.setData({ page: nextPage })
    this._load()
  },

  onPullDownRefresh: function () {
    var self = this
    this._resetAndLoad()
    setTimeout(function () {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  _myUserId: function () {
    var user = getApp().globalData.user || {}
    return user.id || 0
  },

  loadAttendees: function (id, page) {
    var self = this
    var myId = this._myUserId()
    return api.activities.attendees(id, { page: page || 1, page_size: 20 }).then(function (data) {
      var items = (data.items || []).map(function (item) {
        return enrichAttendee(item, myId)
      })
      self.setData({
        attendees: items,
        attendeesExpired: !!data.is_expired,
        attendeesTotal: data.total || items.length
      })
      return data
    }).catch(function () {
      self.setData({ attendees: [], attendeesExpired: false, attendeesTotal: 0 })
    })
  },

  showActivityDetail: function (activity) {
    var self = this
    var myId = this._myUserId()
    this.setData({
      modal: 'detail',
      selectedActivity: activity,
      myChecked: false,
      attendees: [],
      attendeesExpired: false,
      attendeesTotal: 0
    })
    if (!activity.isJoined) return

    api.activities.detail(activity.id).then(function (data) {
      var myChecked = false
      ;(data.checkins || []).forEach(function (c) {
        if (c.user_id === myId && c.checked_in_at) myChecked = true
      })
      self.setData({ myChecked: myChecked })
      if (myChecked) {
        self.loadAttendees(activity.id)
      }
    }).catch(function () {})
  },

  openDetail: function (e) {
    var id = e.currentTarget.dataset.id
    var all = this.data._allActivities || []
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { a = all[i]; break }
    }
    if (!a) return
    this.showActivityDetail(a)
  },

  checkin: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.activities.checkin(id).then(function (res) {
      if (res && res.hint === 'already_checked_in') {
        wx.showToast({ title: '您已签到', icon: 'none' })
      } else {
        wx.showToast({ title: '签到成功', icon: 'success' })
      }
      self.setData({ myChecked: true })
      self.loadAttendees(id)
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' })
    })
  },

  addFriendFromAttendee: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.friends.add(id, '活动相识').then(function (res) {
      if (res && res.hint === 'incoming') {
        wx.showToast({ title: '对方已申请，请在申请栏接受', icon: 'none' })
      } else {
        wx.showToast({ title: '申请已发送', icon: 'success' })
      }
      var selected = self.data.selectedActivity
      if (selected && selected.id) {
        self.loadAttendees(selected.id)
      }
    }).catch(function () {})
  },

  openSignup: function (e) {
    var id = e.currentTarget.dataset.id
    var all = this.data._allActivities || []
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { a = all[i]; break }
    }
    if (!a) return
    this.setData({ modal: 'signup', selectedActivity: a })
  },

  confirmSignup: function (e) {
    var self = this
    var id = e.currentTarget.dataset.id
    api.activities.signup(id).then(function () {
      self.setData({ modal: null })
      wx.showToast({ title: '报名成功', icon: 'success' })
      self._resetAndLoad()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '报名失败', icon: 'none' })
    })
  },

  prepareShareActivity: function (e) {
    var id = e && e.currentTarget && e.currentTarget.dataset.id
    if (!id) return
    var all = this.data._allActivities || []
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { a = all[i]; break }
    }
    if (!a) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    this.setData({ shareMode: 'activity', shareActivityId: a.id, selectedActivity: a })
  },

  shareActivity: function (e) {
    this.prepareShareActivity(e)
  },

  onShareAppMessage: function () {
    var actId = this.data.shareActivityId
    var a = this.data.selectedActivity
    if (this.data.shareMode === 'activity' && actId) {
      return {
        title: (a && a.title ? a.title : '企盟活动') + ' - 活动',
        path: '/pages/tasks/tasks?activityId=' + actId + '&sub=1'
      }
    }
    return { title: '企盟活动', path: '/pages/tasks/tasks?sub=1' }
  },

  closeModal: function () {
    this.setData({
      modal: null,
      myChecked: false,
      attendees: [],
      attendeesExpired: false
    })
  },
  stopProp: function () {}
})
