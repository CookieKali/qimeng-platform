var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var api = apiModule.api
var CLV = apiModule.CLV
var avatarColors = apiModule.avatarColors
var creditLvClass = apiModule.creditLvClass

var ACT_LABELS = ['全部', '即将开始', '进行中', '已结束']
var ACT_KEYS = ['all', 'upcoming', 'ongoing', 'ended']
var TYPE_CLASS = { '闭门沙龙': 'pp', '行业论坛': 'pt', '工作坊': 'pa', '资源对接': 'pc' }

var LV_GUIDE_LEVELS = [
  { level: 'B级', desc: '新人会员，可承接基础任务' },
  { level: 'A级', desc: '活跃成员，解锁更多任务类型（默认起点）' },
  { level: 'S级', desc: '优质合伙人，享有优先推荐' },
  { level: 'SS级', desc: '核心贡献者，全平台最高信任度' },
  { level: 'SSS级', desc: '创始合伙人，平台共建者' }
]

function taskFromMyRecord(record, kind, postedIds, joinedIds) {
  var isPosted = kind === 'posted'
  var partial = {
    id: record.id,
    title: record.title || ('任务 #' + record.id),
    category: record.category || '其他',
    description: record.description || '',
    base_credit_per_person: isPosted ? (record.pool || 0) : (record.paid || 0),
    total_quota: record.total_quota || 1,
    applied: record.applied || 0,
    min_reputation_level: record.min_reputation_level || 'B',
    status: record.status || (isPosted ? 'open' : 'in_progress'),
    deliver_deadline: record.deliver_deadline || null,
    host_id: record.host_id || 0,
    host_name: record.host_name || ''
  }
  return enrichTask(partial, postedIds, joinedIds)
}

function mergeMyTasks(records, kind, allTasks, postedIds, joinedIds) {
  var map = {}
  ;(allTasks || []).forEach(function (t) {
    map[t.id] = t
  })
  return (records || []).map(function (r) {
    return map[r.id] || taskFromMyRecord(r, kind, postedIds, joinedIds)
  })
}

function enrichTask(t, myPostedIds, myJoinedIds) {
  var statusMap = { open: '招募中', in_progress: '进行中' }
  var statusClsMap = { open: 'pg', in_progress: 'pa' }
  var colors = avatarColors(t.host_id)
  var credits = t.base_credit_per_person || 0
  var deadline = t.deliver_deadline ? t.deliver_deadline.slice(0, 10) : ''
  var status = t.status || 'open'
  var isPosted = myPostedIds.indexOf(t.id) !== -1
  var statusLabel
  var statusCls
  var showComplete = false
  if (status === 'completed') {
    statusLabel = '已完成'
    statusCls = 'completed'
    showComplete = false
  } else if (status === 'in_progress' && isPosted) {
    statusLabel = statusMap.in_progress
    statusCls = statusClsMap.in_progress
    showComplete = true
  } else {
    statusLabel = statusMap[status] || status
    statusCls = statusClsMap[status] || 'pb'
  }
  return {
    id: t.id,
    title: t.title || '',
    cat: t.category || '其他',
    creditsStr: String(credits),
    credits: credits,
    statusLabel: statusLabel,
    statusCls: statusCls,
    deadline: deadline,
    minLv: t.min_reputation_level || 'B',
    joined: t.applied || 0,
    quota: t.total_quota || 1,
    desc: t.description || '',
    posterName: t.host_name || '',
    posterAbbr: (t.host_name || '').slice(0, 2),
    posterBg: colors.bg,
    posterC: colors.c,
    posterCreditLv: t.host_level || 'A',
    posterCreditLvCls: creditLvClass(t.host_level || 'A'),
    isMine: isPosted,
    isPosted: isPosted,
    isJoined: myJoinedIds.indexOf(t.id) !== -1,
    status: status,
    showComplete: showComplete
  }
}

function getActivityStatus(startAt) {
  if (!startAt) return 'upcoming'
  var d = new Date(startAt)
  var now = new Date()
  var diff = (d - now) / 86400000
  if (diff > 0.5) return 'upcoming'
  if (diff >= -0.5) return 'ongoing'
  return 'ended'
}

var DELIVERY_STATUS = {
  pending: { label: '待审', cls: 'delivery-pending' },
  approved: { label: '已通过', cls: 'delivery-approved' },
  rejected: { label: '已驳回', cls: 'delivery-rejected' }
}

function enrichDelivery(d, isHost) {
  var meta = DELIVERY_STATUS[d.status] || { label: d.status || '未知', cls: 'delivery-pending' }
  return {
    id: d.id,
    task_id: d.task_id,
    executor_id: d.executor_id,
    executor_name: d.executor_name || '',
    content: d.content || '',
    attachments: d.attachments || [],
    status: d.status,
    statusLabel: meta.label,
    statusCls: meta.cls,
    reject_reason: d.reject_reason || '',
    created_at: d.created_at || '',
    reviewed_at: d.reviewed_at || '',
    showReview: !!isHost && d.status === 'pending'
  }
}

function enrichAttendeeRow(a) {
  var signedIn = !!a.signed_in
  return {
    user_id: a.user_id,
    name: a.name || '',
    phone: a.phone || '',
    reputation_level: a.reputation_level || 'B',
    signed_in: signedIn,
    signed_in_at: a.signed_in_at || '',
    statusLabel: signedIn ? '已签到 ✓' : '未签到',
    showSignin: !signedIn
  }
}

function parseActivityType(description) {
  var d = description || ''
  var m = /^【([^】]+)】/.exec(d)
  if (m && TYPE_CLASS[m[1]]) {
    return { type: m[1], desc: d.slice(m[0].length).trim() }
  }
  return { type: '活动', desc: d }
}

function enrichActivity(a, mySignupIds, myUserId) {
  var status = a.start_at ? getActivityStatus(a.start_at) : (a.status || 'upcoming')
  var statusLabels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束' }
  var statusCls = { upcoming: 'pg', ongoing: 'pa', ended: 'pgr' }
  var isJoined = mySignupIds.indexOf(a.id) !== -1
  var hostId = a.host_id || 0
  var isHost = !!(myUserId && hostId && hostId === myUserId)
  var date = a.start_at ? a.start_at.slice(0, 10) : ''
  var parsed = parseActivityType(a.description)
  var type = a.type || parsed.type
  return {
    id: a.id,
    title: a.title || '',
    date: date,
    space: a.location || '',
    type: type,
    typeClass: TYPE_CLASS[type] || 'pb',
    seats: a.capacity || 0,
    desc: parsed.desc || a.description || '',
    host_id: hostId,
    host_name: a.host_name || '',
    signups: a.signups || 0,
    status: status,
    statusLabel: statusLabels[status] || '即将开始',
    statusCls: statusCls[status] || 'pg',
    isJoined: isJoined,
    isCheckedIn: false,
    isHost: isHost,
    canViewAttendees: true,
    enrichedAttendees: [],
    attendees: []
  }
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    MY: {},
    myCreditLv: 'A',
    myCreditFee: '5%',
    sub: 0,
    taskSub: 0,
    taskFilter: '全部',
    searchText: '',
    openFilter: null,
    cats: ['全部', '活动策划', '内容创作', '设计', '资源对接', '推广', '咨询'],
    lvOptions: ['B', 'A', 'S', 'SS'],
    displayTasks: [],
    myJoinedTasks: [],
    myPostedTasks: [],
    _allTasks: [],
    _myPostedIds: [],
    _myJoinedIds: [],
    actSub: 0,
    subLabel: '全部',
    displayActivities: [],
    _allActivities: [],
    _mySignupIds: [],
    modal: null,
    selectedTask: null,
    selectedActivity: null,
    deliveryList: [],
    deliveryTaskId: 0,
    deliveryIsHost: false,
    attendeeList: [],
    attendeeActivityId: 0,
    loading: true,
    shareMode: '',
    shareTaskId: 0,
    shareActivityId: 0,
    lvGuideLevels: LV_GUIDE_LEVELS
  },

  onLoad: function (options) {
    this.setData(layout.getPageInsets())
    this._applyShareQuery(options)
  },

  onShow: function () {
    tabUtil.setTab(this, 1)
    this._applyShareQueryFromEnter()
    var app = getApp()
    if (app.globalData.taskNeedRefresh) {
      app.globalData.taskNeedRefresh = false
    }
    var subTarget = app.globalData.taskSubTarget
    if (subTarget !== undefined && subTarget !== null) {
      app.globalData.taskSubTarget = null
      this.setData({ taskSub: subTarget })
    }
    if (app.globalData.activityNeedRefresh) {
      app.globalData.activityNeedRefresh = false
    }
    var openTaskId = wx.getStorageSync('qm_open_task_id')
    var openActivityId = wx.getStorageSync('qm_open_activity_id')
    if (openTaskId) wx.removeStorageSync('qm_open_task_id')
    if (openActivityId) wx.removeStorageSync('qm_open_activity_id')
    this._pendingOpenTaskId = openTaskId ? parseInt(openTaskId, 10) : null
    this._pendingOpenActivityId = openActivityId ? parseInt(openActivityId, 10) : null
    this._load()
  },

  onPullDownRefresh: function () {
    var p = this._load()
    if (p && typeof p.then === 'function') {
      p.then(function () { wx.stopPullDownRefresh() })
        .catch(function () { wx.stopPullDownRefresh() })
    } else {
      wx.stopPullDownRefresh()
    }
  },

  _applyShareQuery: function (options) {
    if (!options) return
    if (options.taskId) {
      this._pendingOpenTaskId = parseInt(options.taskId, 10)
      this.setData({ sub: 0 })
    }
    if (options.activityId) {
      this._pendingOpenActivityId = parseInt(options.activityId, 10)
      this.setData({ sub: 1 })
    }
    if (options.sub !== undefined && options.sub !== '') {
      var s = parseInt(options.sub, 10)
      if (!isNaN(s)) this.setData({ sub: s })
    }
  },

  _applyShareQueryFromEnter: function () {
    try {
      if (!wx.getEnterOptionsSync) return
      var enter = wx.getEnterOptionsSync()
      var q = (enter && enter.query) || {}
      if (q.taskId || q.activityId) {
        this._applyShareQuery(q)
      }
    } catch (e) {}
  },

  _openPendingFromSearch: function () {
    var self = this
    if (this._pendingOpenActivityId) {
      var actId = this._pendingOpenActivityId
      this._pendingOpenActivityId = null
      this.setData({ sub: 1 })
      var all = this.data._allActivities || []
      var a = null
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === actId) { a = all[i]; break }
      }
      if (a) {
        this.setData({ modal: 'detail', selectedActivity: a })
        return
      }
      api.activities.detail(actId).then(function (data) {
        if (!data) return
        var uid = (getApp().globalData.user || {}).id
        var enriched = enrichActivity(data, self.data._mySignupIds || [], uid)
        self.setData({ sub: 1, modal: 'detail', selectedActivity: enriched })
        self._applyActFilter()
      }).catch(function () {})
      return
    }
    if (this._pendingOpenTaskId) {
      var taskId = this._pendingOpenTaskId
      this._pendingOpenTaskId = null
      this.setData({ sub: 0 })
      var tasks = (this.data._allTasks || [])
        .concat(this.data.myJoinedTasks || [])
        .concat(this.data.myPostedTasks || [])
      var t = null
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].id === taskId) { t = tasks[j]; break }
      }
      if (t) {
        this.setData({ modal: 'td', selectedTask: t })
        return
      }
      api.tasks.detail(taskId).then(function (data) {
        if (!data) return
        var partial = Object.assign({}, data, { host_name: '', applied: (data.participants || []).length })
        var enriched = enrichTask(partial, self.data._myPostedIds || [], self.data._myJoinedIds || [])
        self.setData({ sub: 0, modal: 'td', selectedTask: enriched })
      }).catch(function () {})
    }
  },

  _load: function () {
    var self = this
    var app = getApp()
    var user = app.globalData.user || {}
    var creditLv = user.reputation_level || 'A'
    var clv = CLV[creditLv] || CLV.A
    this.setData({ MY: user, myCreditLv: creditLv, myCreditFee: clv.fee, loading: true })

    return Promise.all([
      api.tasks.list({ page: 1, page_size: 100 }),
      api.tasks.my(),
      api.activities.list(),
      api.activities.mySignups().catch(function () { return { ids: [] } })
    ]).then(function (results) {
      var tasksData = results[0]
      var myData = results[1]
      var activitiesData = results[2]
      var signupData = results[3]
      var postedIds = (myData.posted || []).map(function (t) { return t.id })
      var joinedIds = (myData.joined || []).map(function (t) { return t.id })
      var allTasks = (tasksData.items || []).map(function (t) {
        return enrichTask(t, postedIds, joinedIds)
      })
      var mySignupIds = signupData.ids || []
      var myUserId = user.id || 0
      var allActivities = (activitiesData.items || []).map(function (a) {
        return enrichActivity(a, mySignupIds, myUserId)
      })
      self.setData({
        _allTasks: allTasks,
        _myPostedIds: postedIds,
        _myJoinedIds: joinedIds,
        myJoinedTasks: mergeMyTasks(myData.joined, 'joined', allTasks, postedIds, joinedIds),
        myPostedTasks: mergeMyTasks(myData.posted, 'posted', allTasks, postedIds, joinedIds),
        _allActivities: allActivities,
        _mySignupIds: mySignupIds
      })
      self._applyFilter()
      self._applyActFilter()
      self.setData({ loading: false })
      self._openPendingFromSearch()
    }).catch(function () {
      self.setData({ loading: false })
    })
  },

  _applyFilter: function () {
    var taskFilter = this.data.taskFilter
    var searchText = this.data.searchText
    var all = this.data._allTasks || []
    var filtered = all.filter(function (t) {
      if (taskFilter !== '全部' && t.cat !== taskFilter) return false
      if (searchText && t.title.indexOf(searchText) === -1) return false
      return true
    })
    this.setData({ displayTasks: filtered })
  },

  _applyActFilter: function () {
    var actSub = this.data.actSub
    var all = this.data._allActivities || []
    var key = ACT_KEYS[actSub]
    var list = key === 'all' ? all : all.filter(function (a) { return a.status === key })
    this.setData({ displayActivities: list, subLabel: ACT_LABELS[actSub] })
  },

  switchSub: function (e) {
    this.setData({ sub: parseInt(e.currentTarget.dataset.n, 10), openFilter: null })
  },

  switchTaskSub: function (e) {
    this.setData({ taskSub: parseInt(e.currentTarget.dataset.n, 10), openFilter: null })
  },

  switchActSub: function (e) {
    var self = this
    var n = parseInt(e.currentTarget.dataset.n, 10)
    this.setData({ actSub: n }, function () { self._applyActFilter() })
  },

  onSearch: function (e) {
    var self = this
    this.setData({ searchText: e.detail.value }, function () { self._applyFilter() })
  },

  toggleFilter: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ openFilter: this.data.openFilter === key ? null : key })
  },

  setCatFilter: function (e) {
    var self = this
    this.setData({ taskFilter: e.currentTarget.dataset.value, openFilter: null }, function () {
      self._applyFilter()
    })
  },

  openTask: function (e) {
    var id = e.currentTarget.dataset.id
    var all = (this.data._allTasks || [])
      .concat(this.data.myJoinedTasks || [])
      .concat(this.data.myPostedTasks || [])
    var t = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { t = all[i]; break }
    }
    if (!t) return
    this.setData({ modal: 'td', selectedTask: t })
  },

  confirmComplete: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '确认完成',
      content: '标记完成后不可撤销，确定继续？',
      success: function (res) {
        if (!res.confirm) return
        api.tasks.complete(id).then(function () {
          wx.showToast({ title: '任务已完成', icon: 'success' })
          self._load()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        })
      }
    })
  },

  joinTask: function (e) {
    var self = this
    var id = e.currentTarget.dataset.id
    api.tasks.join(id).then(function () {
      wx.showToast({ title: '申请已提交', icon: 'success' })
      self._load()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '申请失败', icon: 'none' })
    })
  },

  prepareShareTask: function () {
    var t = this.data.selectedTask
    if (!t || !t.id) {
      wx.showToast({ title: '请先打开任务详情', icon: 'none' })
      return
    }
    this.setData({
      shareMode: 'task',
      shareTaskId: t.id,
      shareActivityId: 0
    })
  },

  prepareShareActivity: function (e) {
    var id = e && e.currentTarget && e.currentTarget.dataset.id
    var a = this.data.selectedActivity
    if (id) {
      var all = this.data._allActivities || []
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { a = all[i]; break }
      }
    }
    if (!a || !a.id) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      return
    }
    this.setData({
      shareMode: 'activity',
      shareActivityId: a.id,
      shareTaskId: 0,
      selectedActivity: a
    })
  },

  shareTask: function () {
    this.prepareShareTask()
  },

  shareActivity: function (e) {
    this.prepareShareActivity(e)
  },

  showPostModal: function () {
    wx.navigateTo({ url: '/pages/post-task/post-task' })
  },

  showPostActivity: function () {
    wx.navigateTo({ url: '/pages/post-activity/post-activity' })
  },

  showLvGuide: function () {
    this.setData({ modal: 'lvGuide' })
  },

  openActDetail: function (e) {
    var id = e.currentTarget.dataset.id
    var all = this.data._allActivities || []
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { a = all[i]; break }
    }
    if (!a) return
    this.setData({ modal: 'detail', selectedActivity: a })
  },

  openActSignup: function (e) {
    var id = e.currentTarget.dataset.id
    var all = this.data._allActivities || []
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { a = all[i]; break }
    }
    if (!a) return
    this.setData({ modal: 'signup', selectedActivity: a })
  },

  confirmActSignup: function (e) {
    var self = this
    var id = e.currentTarget.dataset.id
    api.activities.signup(id).then(function () {
      self.setData({ modal: null })
      wx.showToast({ title: '报名成功', icon: 'success' })
      self._load()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '报名失败', icon: 'none' })
    })
  },

  selfCheckin: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    api.activities.checkin(id).then(function () {
      wx.showToast({ title: '签到成功', icon: 'success' })
      var all = (self.data._allActivities || []).map(function (a) {
        return a.id === id ? Object.assign({}, a, { isCheckedIn: true }) : a
      })
      self.setData({ _allActivities: all })
      self._applyActFilter()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' })
    })
  },

  submitDelivery: function (e) {
    var self = this
    var taskId = parseInt(e.currentTarget.dataset.id, 10)
    if (!taskId) return
    wx.showModal({
      title: '提交成果',
      editable: true,
      placeholderText: '请描述交付成果',
      success: function (res) {
        if (!res.confirm) return
        var content = (res.content || '').trim()
        if (!content) {
          wx.showToast({ title: '请填写成果描述', icon: 'none' })
          return
        }
        api.tasks.deliver(taskId, content).then(function () {
          wx.showToast({ title: '成果已提交', icon: 'success' })
          self._load()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
        })
      }
    })
  },

  showDeliveries: function (e) {
    var self = this
    var taskId = parseInt(e.currentTarget.dataset.id, 10)
    if (!taskId) return
    var isHost = (this.data._myPostedIds || []).indexOf(taskId) !== -1
    api.tasks.deliveries(taskId).then(function (data) {
      var items = (data.items || []).map(function (d) {
        return enrichDelivery(d, isHost)
      })
      self.setData({
        deliveryList: items,
        deliveryTaskId: taskId,
        deliveryIsHost: isHost,
        modal: 'deliveries'
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  _reloadDeliveries: function (taskId) {
    var self = this
    var isHost = (this.data._myPostedIds || []).indexOf(taskId) !== -1
    return api.tasks.deliveries(taskId).then(function (data) {
      var items = (data.items || []).map(function (d) {
        return enrichDelivery(d, isHost)
      })
      self.setData({ deliveryList: items, deliveryTaskId: taskId, deliveryIsHost: isHost })
    })
  },

  reviewDelivery: function (e) {
    var self = this
    var taskId = this.data.deliveryTaskId || parseInt(e.currentTarget.dataset.taskId, 10)
    var deliveryId = parseInt(e.currentTarget.dataset.deliveryId, 10)
    var action = e.currentTarget.dataset.action
    if (!taskId || !deliveryId || !action) return

    if (action === 'reject') {
      wx.showModal({
        title: '驳回交付',
        editable: true,
        placeholderText: '请填写驳回原因',
        success: function (res) {
          if (!res.confirm) return
          var reason = (res.content || '').trim()
          if (!reason) {
            wx.showToast({ title: '请填写驳回原因', icon: 'none' })
            return
          }
          self._doReviewDelivery(taskId, deliveryId, action, reason)
        }
      })
      return
    }

    wx.showModal({
      title: '确认通过',
      content: '通过后任务将完成，并为执行方增加信用分',
      success: function (res) {
        if (!res.confirm) return
        self._doReviewDelivery(taskId, deliveryId, action, '')
      }
    })
  },

  _doReviewDelivery: function (taskId, deliveryId, action, reason) {
    var self = this
    api.tasks.reviewDelivery(taskId, deliveryId, action, reason).then(function () {
      wx.showToast({
        title: action === 'approve' ? '已通过' : '已驳回',
        icon: 'success'
      })
      self._load()
      if (self.data.modal === 'deliveries') {
        self._reloadDeliveries(taskId)
      }
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    })
  },

  submitAppeal: function (e) {
    var taskId = parseInt(e.currentTarget.dataset.taskId, 10)
    if (!taskId) return
    wx.showModal({
      title: '提交申诉',
      editable: true,
      placeholderText: '请说明申诉理由',
      success: function (res) {
        if (!res.confirm) return
        var reason = (res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写申诉理由', icon: 'none' })
          return
        }
        api.tasks.appeal(taskId, reason).then(function () {
          wx.showToast({ title: '申诉已提交', icon: 'success' })
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
        })
      }
    })
  },

  showAttendees: function (e) {
    var self = this
    var activityId = parseInt(e.currentTarget.dataset.id, 10)
    if (!activityId) return
    api.activities.attendees(activityId, { manage: 1 }).then(function (data) {
      var items = (data.items || []).map(enrichAttendeeRow)
      self.setData({
        attendeeList: items,
        attendeeActivityId: activityId,
        modal: 'attendees'
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  confirmAttendeeSignin: function (e) {
    var self = this
    var userId = parseInt(e.currentTarget.dataset.userId, 10)
    var activityId = this.data.attendeeActivityId
    if (!activityId || !userId) return
    api.activities.signin(activityId, userId).then(function () {
      var list = (self.data.attendeeList || []).map(function (item) {
        if (item.user_id !== userId) return item
        return {
          user_id: item.user_id,
          name: item.name,
          phone: item.phone,
          reputation_level: item.reputation_level,
          signed_in: true,
          signed_in_at: item.signed_in_at,
          statusLabel: '已签到 ✓',
          showSignin: false
        }
      })
      self.setData({ attendeeList: list })
      wx.showToast({ title: '签到成功', icon: 'success' })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' })
    })
  },

  closeModal: function () {
    this.setData({
      modal: null,
      deliveryList: [],
      deliveryTaskId: 0,
      deliveryIsHost: false,
      attendeeList: [],
      attendeeActivityId: 0
    })
  },
  stopProp: function () {},

  onShareAppMessage: function () {
    var mode = this.data.shareMode
    var taskId = this.data.shareTaskId || (this.data.selectedTask && this.data.selectedTask.id)
    var actId = this.data.shareActivityId || (this.data.selectedActivity && this.data.selectedActivity.id)
    if (mode === 'task' && taskId) {
      var t = this.data.selectedTask || {}
      return {
        title: (t.title || '企盟任务') + ' - 任务广场',
        path: '/pages/tasks/tasks?taskId=' + taskId
      }
    }
    if (mode === 'activity' && actId) {
      var a = this.data.selectedActivity || {}
      return {
        title: (a.title || '企盟活动') + ' - 活动',
        path: '/pages/tasks/tasks?activityId=' + actId + '&sub=1'
      }
    }
    return {
      title: '企盟任务广场',
      path: '/pages/tasks/tasks'
    }
  }
})
