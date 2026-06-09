var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var shareUtil = require('../../utils/share-friends')
var api = apiModule.api
var CLV = apiModule.CLV
var avatarColors = apiModule.avatarColors
var creditLvClass = apiModule.creditLvClass
var resolveAvatarUrl = apiModule.resolveAvatarUrl

var ACT_LABELS = ['广场', '我报名', '我发布']
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
    base_credit_per_person: isPosted
      ? (record.base_credit_per_person || record.pool || 0)
      : (record.base_credit_per_person || record.paid || 0),
    total_quota: record.total_quota || 1,
    applied: record.applied || 0,
    min_reputation_level: record.min_reputation_level || 'B',
    status: record.status || (isPosted ? 'open' : (record.task_status || 'in_progress')),
    deliver_deadline: record.deliver_deadline || null,
    host_id: record.host_id || 0,
    host_name: record.host_name || '',
    cover_url: record.cover_url || ''
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
  } else if (status === 'cancelled') {
    statusLabel = '已下架'
    statusCls = 'pgr'
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
    coverUrl: resolveAvatarUrl(t.cover_url),
    posterName: t.host_name || '',
    posterJob: t.host_job || t.job_title || '',
    posterAbbr: (t.host_name || '').slice(0, 2),
    posterBg: colors.bg,
    posterC: colors.c,
    posterCreditLv: t.host_level || 'A',
    posterCreditLvCls: creditLvClass(t.host_level || 'A'),
    isMine: isPosted,
    isPosted: isPosted,
    isJoined: myJoinedIds.indexOf(t.id) !== -1,
    status: status,
    showComplete: showComplete,
    canDismiss: status === 'completed' || status === 'cancelled'
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

function enrichApplicant(a, taskId, taskStatus) {
  var statusMap = {
    applied: { label: '待审核', cls: 'applicant-pending' },
    accepted: { label: '已录用', cls: 'applicant-accepted' },
    submitted: { label: '已交付', cls: 'applicant-submitted' },
    reviewed: { label: '已验收', cls: 'applicant-reviewed' },
    rejected: { label: '已拒绝', cls: 'applicant-rejected' }
  }
  var meta = statusMap[a.status] || { label: a.status || '未知', cls: 'applicant-pending' }
  var canAccept = a.status === 'applied' && taskStatus === 'open'
  return {
    participant_id: a.participant_id,
    user_id: a.user_id,
    name: a.name || '',
    job_title: a.job_title || '',
    reputation_level: a.reputation_level || 'B',
    status: a.status,
    statusLabel: meta.label,
    statusCls: meta.cls,
    applied_at: a.applied_at ? String(a.applied_at).slice(0, 10) : '',
    showAccept: canAccept,
    task_id: taskId
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

function activityFromMyRecord(record, kind, mySignupIds, myUserId) {
  var isPosted = kind === 'posted'
  var partial = {
    id: record.id,
    title: record.title || ('活动 #' + record.id),
    description: record.description || '',
    cover_url: record.cover_url || '',
    location: record.location || '',
    capacity: record.capacity || 0,
    signups: record.signups || 0,
    start_at: record.start_at || null,
    end_at: record.end_at || null,
    host_id: record.host_id || (isPosted ? myUserId : 0),
    host_name: record.host_name || '',
    status: record.status || 'open'
  }
  var enriched = enrichActivity(partial, mySignupIds, myUserId)
  if (kind === 'joined' && record.checked_in_at) {
    enriched.isCheckedIn = true
  }
  return enriched
}

function mergeMyActivities(records, kind, allActivities, mySignupIds, myUserId) {
  var map = {}
  ;(allActivities || []).forEach(function (a) {
    map[a.id] = a
  })
  return (records || []).map(function (r) {
    return map[r.id] || activityFromMyRecord(r, kind, mySignupIds, myUserId)
  })
}

function enrichActivity(a, mySignupIds, myUserId) {
  var dbStatus = a.status || 'open'
  var parsed = parseActivityType(a.description)
  var type = a.type || parsed.type
  var hostId = a.host_id || 0
  var isHost = !!(myUserId && hostId && hostId === myUserId)
  var isJoined = mySignupIds.indexOf(a.id) !== -1
  var date = a.start_at ? a.start_at.slice(0, 10) : ''
  if (dbStatus === 'cancelled') {
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
      status: 'cancelled',
      dbStatus: dbStatus,
      statusLabel: '已取消',
      statusCls: 'pgr',
      isJoined: isJoined,
      isCheckedIn: false,
      isHost: isHost,
      isPosted: isHost,
      coverUrl: resolveAvatarUrl(a.cover_url),
      canViewAttendees: false,
      enrichedAttendees: [],
      attendees: []
    }
  }
  var status = a.start_at ? getActivityStatus(a.start_at) : 'upcoming'
  var statusLabels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束' }
  var statusCls = { upcoming: 'pg', ongoing: 'pa', ended: 'pgr' }
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
    dbStatus: dbStatus,
    statusLabel: statusLabels[status] || '即将开始',
    statusCls: statusCls[status] || 'pg',
    isJoined: isJoined,
    isCheckedIn: false,
    isHost: isHost,
    isPosted: isHost,
    coverUrl: resolveAvatarUrl(a.cover_url),
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
    subLabel: '广场',
    displayActivities: [],
    myJoinedActivities: [],
    myPostedActivities: [],
    _allActivities: [],
    _mySignupIds: [],
    modal: null,
    selectedTask: null,
    selectedActivity: null,
    deliveryList: [],
    deliveryTaskId: 0,
    deliveryAppeal: null,
    deliveryIsHost: false,
    reviewScores: { performance: 80, quality: 80, professional: 80, compliance: 80 },
    reviewPreviewSat: 80,
    pendingReviewDeliveryId: 0,
    attendeeList: [],
    attendeeActivityId: 0,
    attendeeActivityTitle: '',
    applicantList: [],
    applicantTaskId: 0,
    applicantTaskTitle: '',
    applicantTaskStatus: '',
    loading: true,
    _dismissedRecordIds: [],
    shareMode: '',
    shareTaskId: 0,
    shareActivityId: 0,
    friendsList: [],
    shareTarget: null,
    shareSearch: '',
    shareSelectedIds: [],
    shareFilteredFriends: [],
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
    var mainSub = app.globalData.tasksMainSub
    if (mainSub !== undefined && mainSub !== null) {
      app.globalData.tasksMainSub = null
      this.setData({ sub: mainSub })
    } else if (this._pendingOpenActivityId) {
      this.setData({ sub: 1 })
    } else if (this._pendingOpenTaskId) {
      this.setData({ sub: 0 })
    }
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
      var all = this._mergedActivities()
      var a = null
      for (var i = 0; i < all.length; i++) {
        if (Number(all[i].id) === Number(actId)) { a = all[i]; break }
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
        if (Number(tasks[j].id) === Number(taskId)) { t = tasks[j]; break }
      }
      if (t) {
        this.setData({ modal: 'td', selectedTask: t })
        return
      }
      api.tasks.detail(taskId).then(function (data) {
        if (!data) return
        var partial = Object.assign({}, data, { applied: (data.participants || []).length })
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
      api.activities.my().catch(function () { return { posted: [], joined: [] } })
    ]).then(function (results) {
      var tasksData = results[0]
      var myData = results[1]
      var activitiesData = results[2]
      var myActData = results[3]
      var postedIds = (myData.posted || []).map(function (t) { return t.id })
      var joinedIds = (myData.joined || []).map(function (t) { return t.id })
      var allTasks = (tasksData.items || []).map(function (t) {
        return enrichTask(t, postedIds, joinedIds)
      })
      var mySignupIds = (myActData.joined || []).map(function (a) { return a.id })
      var myUserId = user.id || 0
      var allActivities = (activitiesData.items || []).map(function (a) {
        return enrichActivity(a, mySignupIds, myUserId)
      })
      // 读取已清除的记录 ID（本地存储）
      var dismissedIds = self._loadDismissedIds()
      var joinedFull = mergeMyTasks(myData.joined, 'joined', allTasks, postedIds, joinedIds)
      var postedFull = mergeMyTasks(myData.posted, 'posted', allTasks, postedIds, joinedIds)
      // 过滤掉用户已手动清除的记录
      var joinedVisible = dismissedIds.length
        ? joinedFull.filter(function (t) { return dismissedIds.indexOf(t.id) === -1 })
        : joinedFull
      var postedVisible = dismissedIds.length
        ? postedFull.filter(function (t) { return dismissedIds.indexOf(t.id) === -1 })
        : postedFull
      self.setData({
        _allTasks: allTasks,
        _myPostedIds: postedIds,
        _myJoinedIds: joinedIds,
        _dismissedRecordIds: dismissedIds,
        myJoinedTasks: joinedVisible,
        myPostedTasks: postedVisible,
        _allActivities: allActivities,
        _mySignupIds: mySignupIds,
        myJoinedActivities: mergeMyActivities(myActData.joined, 'joined', allActivities, mySignupIds, myUserId),
        myPostedActivities: mergeMyActivities(myActData.posted, 'posted', allActivities, mySignupIds, myUserId)
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
      // 广场只展示招募中 / 进行中，已完成和已下架不在广场显示
      if (t.status === 'completed' || t.status === 'cancelled') return false
      if (taskFilter !== '全部' && t.cat !== taskFilter) return false
      if (searchText && t.title.indexOf(searchText) === -1) return false
      return true
    })
    this.setData({ displayTasks: filtered })
  },

  _applyActFilter: function () {
    var actSub = this.data.actSub
    var square = (this.data._allActivities || []).filter(function (a) {
      return a.status !== 'cancelled'
    })
    var list
    if (actSub === 0) {
      list = square
    } else if (actSub === 1) {
      list = this.data.myJoinedActivities || []
    } else {
      list = this.data.myPostedActivities || []
    }
    this.setData({ displayActivities: list, subLabel: ACT_LABELS[actSub] })
  },

  _mergedActivities: function () {
    return (this.data._allActivities || [])
      .concat(this.data.myJoinedActivities || [])
      .concat(this.data.myPostedActivities || [])
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

  goSpaces: function () {
    wx.navigateTo({ url: '/pages/spaces/spaces' })
  },

  openTask: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    var postedIds = this.data._myPostedIds || []
    var joinedIds = this.data._myJoinedIds || []
    var show = function (t) {
      self.setData({ modal: 'td', selectedTask: t })
    }
    var all = (this.data._allTasks || [])
      .concat(this.data.myJoinedTasks || [])
      .concat(this.data.myPostedTasks || [])
    var t = null
    for (var i = 0; i < all.length; i++) {
      if (Number(all[i].id) === id) { t = all[i]; break }
    }
    if (t && t.desc) {
      show(t)
      return
    }
    wx.showLoading({ title: '加载中', mask: true })
    api.tasks.detail(id).then(function (data) {
      if (!data) {
        wx.showToast({ title: '任务不存在', icon: 'none' })
        return
      }
      show(enrichTask(data, postedIds, joinedIds))
    }).catch(function (err) {
      if (t) show(t)
      else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }).finally(function () {
      wx.hideLoading()
    })
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

  prepareShareTask: function (e) {
    var t = this.data.selectedTask
    var id = e && e.currentTarget && e.currentTarget.dataset.id
    if (id) {
      var all = (this.data._allTasks || [])
        .concat(this.data.myJoinedTasks || [])
        .concat(this.data.myPostedTasks || [])
      for (var i = 0; i < all.length; i++) {
        if (Number(all[i].id) === Number(id)) { t = all[i]; break }
      }
    }
    if (!t || !t.id) {
      wx.showToast({ title: '请先打开任务详情', icon: 'none' })
      return
    }
    this.setData({
      shareMode: 'task',
      shareTaskId: t.id,
      shareActivityId: 0,
      selectedTask: t
    })
  },

  _openShareFriendModal: function (target) {
    var self = this
    var filtered = shareUtil.filterShareFriends(this.data.friendsList, '')
    this.setData({
      modal: 'shareFriend',
      shareTarget: target,
      shareSearch: '',
      shareSelectedIds: [],
      shareFilteredFriends: shareUtil.markShareFriendsSelected(filtered, [])
    })
  },

  _ensureFriendsForShare: function (cb) {
    var self = this
    if ((this.data.friendsList || []).length) {
      if (cb) cb()
      return
    }
    wx.showLoading({ title: '加载好友...', mask: true })
    api.friends.list().then(function (data) {
      wx.hideLoading()
      var friends = (data.items || []).map(function (f) {
        return shareUtil.mapFriendFromApi(f, avatarColors, resolveAvatarUrl)
      })
      self.setData({ friendsList: friends }, function () {
        if (cb) cb()
      })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '加载好友失败', icon: 'none' })
    })
  },

  openShareToFriends: function (e) {
    var self = this
    var kind = e.currentTarget.dataset.kind
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id || !kind) return

    var target = null
    if (kind === 'task') {
      var tasks = (this.data._allTasks || [])
        .concat(this.data.myJoinedTasks || [])
        .concat(this.data.myPostedTasks || [])
      var t = null
      for (var i = 0; i < tasks.length; i++) {
        if (Number(tasks[i].id) === id) { t = tasks[i]; break }
      }
      if (!t) {
        wx.showToast({ title: '任务不存在', icon: 'none' })
        return
      }
      target = {
        kind: 'task',
        id: t.id,
        kindLabel: '任务',
        title: t.title || '',
        meta: (t.cat || '') + (t.creditsStr ? ' · ' + t.creditsStr + ' 积分' : '')
      }
    } else {
      var all = this._mergedActivities()
      var a = null
      for (var j = 0; j < all.length; j++) {
        if (Number(all[j].id) === id) { a = all[j]; break }
      }
      if (!a) {
        wx.showToast({ title: '活动不存在', icon: 'none' })
        return
      }
      target = {
        kind: 'activity',
        id: a.id,
        kindLabel: '活动',
        title: a.title || '',
        meta: (a.date || '') + (a.space ? ' · ' + a.space : '')
      }
    }

    this._ensureFriendsForShare(function () {
      self._openShareFriendModal(target)
    })
  },

  onShareFriendSearch: function (e) {
    var search = e.detail.value || ''
    var filtered = shareUtil.filterShareFriends(this.data.friendsList, search)
    this.setData({
      shareSearch: search,
      shareFilteredFriends: shareUtil.markShareFriendsSelected(filtered, this.data.shareSelectedIds)
    })
  },

  toggleShareFriend: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var ids = this.data.shareSelectedIds.slice()
    var idx = ids.indexOf(id)
    if (idx >= 0) ids.splice(idx, 1)
    else ids.push(id)
    this.setData({
      shareSelectedIds: ids,
      shareFilteredFriends: shareUtil.markShareFriendsSelected(this.data.shareFilteredFriends, ids)
    })
  },

  sendShareToFriends: function () {
    var self = this
    var target = this.data.shareTarget
    var ids = (this.data.shareSelectedIds || []).map(function (id) {
      return parseInt(id, 10)
    }).filter(function (id) { return !!id })
    if (!target || !target.id) {
      wx.showToast({ title: '分享内容无效', icon: 'none' })
      return
    }
    if (!ids.length) {
      wx.showToast({ title: '请先选择好友', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发送中', mask: true })
    var req = target.kind === 'task'
      ? api.inbox.shareTask({ task_id: target.id, to_user_ids: ids })
      : api.inbox.shareActivity({ activity_id: target.id, to_user_ids: ids })
    req.then(function (data) {
      wx.hideLoading()
      var n = (data && data.sent) || ids.length
      wx.showToast({ title: '已发送给 ' + n + ' 位好友', icon: 'success' })
      self.setData({
        modal: null,
        shareTarget: null,
        shareSearch: '',
        shareSelectedIds: [],
        shareFilteredFriends: []
      })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    })
  },

  prepareShareActivity: function (e) {
    var id = e && e.currentTarget && e.currentTarget.dataset.id
    var a = this.data.selectedActivity
    if (id) {
      var all = this._mergedActivities()
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
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var all = this._mergedActivities()
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (Number(all[i].id) === id) { a = all[i]; break }
    }
    if (!a) return
    this.setData({ modal: 'detail', selectedActivity: a })
  },

  openActSignup: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var all = this._mergedActivities()
    var a = null
    for (var i = 0; i < all.length; i++) {
      if (Number(all[i].id) === id) { a = all[i]; break }
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

  _formatDeliveryAppeal: function (items) {
    var list = items || []
    if (!list.length) return null
    var a = list[0]
    var labelMap = { pending: '申诉处理中', resolved: '申诉已解决', rejected: '申诉已驳回' }
    var st = a.status || 'pending'
    return {
      id: a.id,
      status: st,
      statusLabel: labelMap[st] || st,
      reason: a.reason || '',
      verdict: a.verdict || '',
      created_at: a.created_at ? String(a.created_at).slice(0, 16).replace('T', ' ') : ''
    }
  },

  showDeliveries: function (e) {
    var self = this
    var taskId = parseInt(e.currentTarget.dataset.id, 10)
    if (!taskId) return
    var isHost = (this.data._myPostedIds || []).indexOf(taskId) !== -1
    Promise.all([
      api.tasks.deliveries(taskId),
      api.tasks.appeals(taskId).catch(function () { return { items: [] } })
    ]).then(function (results) {
      var data = results[0] || {}
      var appealData = results[1] || {}
      var items = (data.items || []).map(function (d) {
        return enrichDelivery(d, isHost)
      })
      self.setData({
        deliveryList: items,
        deliveryTaskId: taskId,
        deliveryIsHost: isHost,
        deliveryAppeal: self._formatDeliveryAppeal(appealData.items),
        modal: 'deliveries'
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  _reloadDeliveries: function (taskId) {
    var self = this
    var isHost = (this.data._myPostedIds || []).indexOf(taskId) !== -1
    return Promise.all([
      api.tasks.deliveries(taskId),
      api.tasks.appeals(taskId).catch(function () { return { items: [] } })
    ]).then(function (results) {
      var data = results[0] || {}
      var appealData = results[1] || {}
      var items = (data.items || []).map(function (d) {
        return enrichDelivery(d, isHost)
      })
      self.setData({
        deliveryList: items,
        deliveryTaskId: taskId,
        deliveryIsHost: isHost,
        deliveryAppeal: self._formatDeliveryAppeal(appealData.items)
      })
    })
  },

  _calcReviewSat: function (scores) {
    var s = scores || this.data.reviewScores || {}
    return Math.round(
      (Number(s.performance) || 0) * 0.4
      + (Number(s.quality) || 0) * 0.3
      + (Number(s.professional) || 0) * 0.2
      + (Number(s.compliance) || 0) * 0.1
    )
  },

  onReviewScoreChange: function (e) {
    var key = e.currentTarget.dataset.key
    var val = parseInt(e.detail.value, 10)
    if (!key) return
    var scores = Object.assign({}, this.data.reviewScores)
    scores[key] = isNaN(val) ? 0 : val
    this.setData({
      reviewScores: scores,
      reviewPreviewSat: this._calcReviewSat(scores)
    })
  },

  closeReviewScoreModal: function () {
    this.setData({ modal: null, pendingReviewDeliveryId: 0 })
  },

  confirmReviewApprove: function () {
    var taskId = this.data.deliveryTaskId
    var deliveryId = this.data.pendingReviewDeliveryId
    if (!taskId || !deliveryId) return
    this._doReviewDelivery(taskId, deliveryId, 'approve', '', this.data.reviewScores)
    this.setData({ modal: null, pendingReviewDeliveryId: 0 })
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

    var scores = { performance: 80, quality: 80, professional: 80, compliance: 80 }
    self.setData({
      modal: 'reviewScore',
      pendingReviewDeliveryId: deliveryId,
      reviewScores: scores,
      reviewPreviewSat: self._calcReviewSat(scores)
    })
  },

  _doReviewDelivery: function (taskId, deliveryId, action, reason, scores) {
    var self = this
    api.tasks.reviewDelivery(taskId, deliveryId, action, reason, scores).then(function (data) {
      var tip = action === 'approve' ? '已通过' : '已驳回'
      if (action === 'approve' && data && data.satisfaction != null) {
        tip = '已通过 · 满意度' + data.satisfaction
      }
      wx.showToast({
        title: tip,
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
          if (self.data.modal === 'deliveries' && self.data.deliveryTaskId === taskId) {
            self._reloadDeliveries(taskId)
          }
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
        attendeeActivityTitle: data.activity_title || '',
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

  viewApplicants: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.tasks.applicants(id).then(function (data) {
      var taskStatus = data.task_status || 'open'
      var items = (data.items || []).map(function (a) {
        return enrichApplicant(a, id, taskStatus)
      })
      self.setData({
        applicantList: items,
        applicantTaskTitle: data.task_title || '',
        applicantTaskId: id,
        applicantTaskStatus: taskStatus,
        modal: 'taskApplicants'
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  editTask: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    this.setData({ modal: null })
    wx.navigateTo({ url: '/pages/post-task/post-task?id=' + id })
  },

  acceptApplicant: function (e) {
    var self = this
    var participantId = parseInt(e.currentTarget.dataset.participantId, 10)
    var taskId = parseInt(e.currentTarget.dataset.taskId, 10)
    if (!participantId || !taskId) return
    wx.showModal({
      title: '确认录用',
      content: '确定录用该申请者？录用后任务状态将变为进行中',
      success: function (res) {
        if (!res.confirm) return
        api.tasks.accept(taskId, participantId).then(function () {
          wx.showToast({ title: '录用成功', icon: 'success' })
          self.viewApplicants({
            currentTarget: { dataset: { id: String(self.data.applicantTaskId || taskId) } }
          })
          self._load()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        })
      }
    })
  },

  cancelTask: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '确认下架',
      content: '确定下架该任务？冻结的积分将退还到账户',
      success: function (res) {
        if (!res.confirm) return
        api.tasks.cancel(id).then(function () {
          wx.showToast({ title: '任务已下架', icon: 'success' })
          self.setData({ modal: null })
          self._load()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        })
      }
    })
  },

  editActivity: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    this.setData({ modal: null })
    wx.navigateTo({ url: '/pages/post-activity/post-activity?id=' + id })
  },

  cancelActivity: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '确认取消',
      content: '确定取消该活动？已报名的成员将收到通知',
      success: function (res) {
        if (!res.confirm) return
        api.activities.cancel(id).then(function () {
          wx.showToast({ title: '活动已取消', icon: 'success' })
          self.setData({ modal: null })
          self._load()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        })
      }
    })
  },

  // ──────────────────────────────────────────────────
  //  清除记录（本地存储，不删后端数据）
  // ──────────────────────────────────────────────────
  _loadDismissedIds: function () {
    try {
      var userId = ((getApp().globalData || {}).user || {}).id || 0
      return wx.getStorageSync('qm_dismissed_tasks_' + userId) || []
    } catch (e) { return [] }
  },

  dismissRecord: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '清除记录',
      content: '将从"我的记录"中隐藏该任务，不影响平台数据，确认？',
      confirmText: '清除',
      success: function (res) {
        if (!res.confirm) return
        var ids = self.data._dismissedRecordIds.slice()
        if (ids.indexOf(id) === -1) ids.push(id)
        try {
          var userId = ((getApp().globalData || {}).user || {}).id || 0
          wx.setStorageSync('qm_dismissed_tasks_' + userId, ids)
        } catch (e) {}
        var joined = (self.data.myJoinedTasks || []).filter(function (t) { return t.id !== id })
        var posted = (self.data.myPostedTasks || []).filter(function (t) { return t.id !== id })
        self.setData({ _dismissedRecordIds: ids, myJoinedTasks: joined, myPostedTasks: posted })
        wx.showToast({ title: '记录已清除', icon: 'success' })
      }
    })
  },

  closeModal: function () {
    this.setData({
      modal: null,
      deliveryList: [],
      deliveryTaskId: 0,
      deliveryAppeal: null,
      deliveryIsHost: false,
      attendeeList: [],
      attendeeActivityId: 0,
      attendeeActivityTitle: '',
      applicantList: [],
      applicantTaskId: 0,
      applicantTaskTitle: '',
      applicantTaskStatus: '',
      shareTarget: null,
      shareSearch: '',
      shareSelectedIds: [],
      shareFilteredFriends: []
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
