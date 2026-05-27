var apiModule = require('../../utils/api')
var config = require('../../config')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var constants = require('../../utils/constants')
var profileGuide = require('../../utils/profileGuide')
var api = apiModule.api
var CLV = apiModule.CLV

function fenToYuan(fen) {
  var n = Number(fen) || 0
  return (n / 100).toFixed(2)
}
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl
var creditLvClass = apiModule.creditLvClass
var lvClass = apiModule.lvClass

function lvBadgeClass(creditLv) {
  if (creditLv === 'SSS') return 'badge-sss'
  if (creditLv === 'SS') return 'badge-ss'
  if (creditLv === 'S') return 'badge-s'
  return ''
}

var ROLE_LABELS = {
  partner: '创始合伙人',
  paid: '企业主',
  investor: '投资人',
  mentor: '专家',
  station_admin: '合伙人',
  super_admin: '创始合伙人',
  normal: '销售'
}

function joinListField(val) {
  if (!val) return ''
  if (Array.isArray(val)) return val.filter(Boolean).join(' · ')
  return String(val)
}

function buildPortfolio(bizmap, industry) {
  var list = Array.isArray(bizmap) ? bizmap : []
  return list.map(function (item) {
    var biz = item.biz || ''
    var category = item.category || industry || ''
    if (!category && biz.indexOf('领域') > 0) {
      category = biz.split('领域')[0]
    }
    if (!category) category = item.co || '业务'
    return {
      category: category,
      role: item.position || item.role || '',
      mainBiz: biz,
      products: item.product || item.products || ''
    }
  })
}

function qrCodeUrlForUser(userId) {
  if (!userId) return ''
  return config.resolveApiBase() + '/api/v1/users/' + userId + '/qrcode'
}

function buildDigitalCard(data, isFriend) {
  var card = data.card || {}
  var resources = joinListField(card.resources)
  var needs = joinListField(card.needs)
  if (!resources && card.status_supply) resources = card.status_supply
  if (!needs && card.status_demand) needs = card.status_demand
  var job = card.job_title || ''
  var region = card.region || ''
  var headline = job
  if (job && region) headline = job + ' · ' + region
  else if (region) headline = region
  return {
    phone: isFriend ? (data.phone || '') : '',
    email: isFriend ? (data.email || '') : '',
    avatarUrl: resolveAvatarUrl(data.avatar_url),
    roleLabel: ROLE_LABELS[data.role] || data.role || '成员',
    headline: headline,
    personalValue: card.bio || '',
    industryText: card.industry || '',
    talentsText: card.talents || '',
    resourcesText: resources,
    needsText: needs,
    portfolio: buildPortfolio(card.business_map, card.industry),
    showContact: isFriend,
    companyFull: isFriend ? (card.company || '') : '',
    qrCodeUrl: qrCodeUrlForUser(data.id)
  }
}

function friendSortRank(m) {
  if (m.isFriend) return 0
  if (m.requestSent || m.pendingIn) return 1
  return 2
}

function filterShareFriends(friends, search) {
  var q = (search || '').trim().toLowerCase()
  var list = friends || []
  var filtered = list.filter(function (f) {
    if (!q) return true
    var name = (f.name || '').toLowerCase()
    var job = (f.job || '').toLowerCase()
    return name.indexOf(q) !== -1 || job.indexOf(q) !== -1
  })
  return filtered.slice(0, 10)
}

function markShareFriendsSelected(friends, selectedIds) {
  var ids = selectedIds || []
  return (friends || []).map(function (f) {
    return Object.assign({}, f, { selected: ids.indexOf(f.id) !== -1 })
  })
}

var ROLE_LABELS = {
  enterprise: '企业主',
  investor: '投资人',
  sales: '销售',
  expert: '专家',
  partner: '合伙人',
  normal: '普通成员'
}

function friendRoleLabel(role) {
  if (!role) return '未设置'
  return ROLE_LABELS[role] || role
}

function friendGroupKey(friend, mode) {
  if (mode === 'region') return friend.region || '未设置'
  if (mode === 'industry') return friend.ind || '未设置'
  if (mode === 'role') return friend.roleLabel || friendRoleLabel(friend.role)
  return friend.group || '生态伙伴'
}

function buildFriendGroups(friends, mode) {
  var buckets = {}
  var order = []
  ;(friends || []).forEach(function (f) {
    var key = friendGroupKey(f, mode)
    if (!buckets[key]) {
      buckets[key] = []
      order.push(key)
    }
    buckets[key].push(f)
  })
  order.sort(function (a, b) {
    if (a === '未设置') return 1
    if (b === '未设置') return -1
    return a.localeCompare(b, 'zh-CN')
  })
  return order.map(function (key) {
    var items = buckets[key].slice().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '', 'zh-CN')
    })
    return { key: key, title: key, count: items.length, items: items }
  })
}

function mapFriendFromApi(f) {
  var colors = avatarColors(f.id)
  return {
    id: f.id,
    name: f.name || '',
    job: f.job_title || '',
    co: f.company || '',
    region: f.region || '',
    ind: constants.normalizeIndustry(f.industry || ''),
    role: f.role || '',
    roleLabel: friendRoleLabel(f.role),
    group: f.group || '生态伙伴',
    scene: f.scene || '',
    nameAbbr: (f.name || '').slice(0, 2),
    bg: colors.bg,
    c: colors.c,
    bc: colors.bc,
    avatarUrl: resolveAvatarUrl(f.avatar_url),
    isFriend: true
  }
}

var SEARCH_HISTORY_KEY = 'qm_search_history'
var MAX_SEARCH_HISTORY = 10
var TASK_STATUS_CLS = {
  open: 'pg',
  in_progress: 'pa',
  completed: 'pb',
  cancelled: 'pgr'
}
var ACT_TYPE_CLASS = { '闭门沙龙': 'pp', '行业论坛': 'pt', '工作坊': 'pa', '资源对接': 'pc' }

function loadSearchHistory() {
  try {
    var raw = wx.getStorageSync(SEARCH_HISTORY_KEY)
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

function saveSearchHistory(keyword) {
  var kw = (keyword || '').trim()
  if (!kw) return
  var list = loadSearchHistory().filter(function (item) { return item !== kw })
  list.unshift(kw)
  if (list.length > MAX_SEARCH_HISTORY) list = list.slice(0, MAX_SEARCH_HISTORY)
  wx.setStorageSync(SEARCH_HISTORY_KEY, list)
}

function enrichSearchUser(u) {
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

function enrichSearchTask(t) {
  return {
    id: t.id,
    title: t.title || '',
    creditsStr: String(t.credits || 0),
    status: t.status || 'open',
    statusLabel: t.status_label || t.status || '',
    statusCls: TASK_STATUS_CLS[t.status] || 'pb'
  }
}

function enrichSearchActivity(a) {
  return {
    id: a.id,
    title: a.title || '',
    date: a.start_at || '',
    location: a.location || ''
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

function enrichActivityFromApi(a, mySignupIds) {
  var ids = mySignupIds || []
  var status = a.start_at ? getActivityStatus(a.start_at) : (a.status || 'upcoming')
  var statusLabels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束' }
  var statusCls = { upcoming: 'pg', ongoing: 'pa', ended: 'pgr' }
  var checkins = a.checkins || []
  var isJoined = checkins.some(function (c) { return c.user_id === (getApp().globalData.user || {}).id }) ||
    ids.indexOf(a.id) !== -1
  var date = a.start_at ? String(a.start_at).slice(0, 10) : ''
  var type = a.type || '活动'
  return {
    id: a.id,
    title: a.title || '',
    date: date,
    space: a.location || '',
    type: type,
    typeClass: ACT_TYPE_CLASS[type] || 'pb',
    seats: a.capacity || 0,
    signups: checkins.length,
    desc: a.description || '',
    host_name: a.host_name || '',
    status: status,
    statusLabel: statusLabels[status] || '即将开始',
    statusCls: statusCls[status] || 'pg',
    isJoined: isJoined
  }
}

function enrichTaskFromApi(t) {
  var statusMap = { open: '招募中', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }
  var statusClsMap = { open: 'pg', in_progress: 'pa', completed: 'pb', cancelled: 'pgr' }
  var credits = t.base_credit_per_person || 0
  var deadline = t.deliver_deadline ? String(t.deliver_deadline).slice(0, 10) : ''
  var status = t.status || 'open'
  return {
    id: t.id,
    title: t.title || '',
    cat: t.category || '其他',
    creditsStr: String(credits),
    statusLabel: statusMap[status] || status,
    statusCls: statusClsMap[status] || 'pb',
    deadline: deadline,
    minLv: t.min_reputation_level || 'B',
    joined: (t.participants || []).length,
    quota: t.total_quota || 1,
    desc: t.description || '',
    status: status
  }
}

function enrichUser(u, friendIds, savedIds) {
  var colors = avatarColors(u.id)
  var status = u.friend_status || (friendIds.indexOf(u.id) !== -1 ? 'friend' : 'none')
  var isFriend = status === 'friend'
  var saved = (savedIds || []).indexOf(u.id) !== -1
  var creditLv = u.reputation_level || 'A'
  var lv = u.level || '标准'
  return {
    id: u.id,
    name: u.name || '',
    nameAbbr: (u.name || '').slice(0, 2),
    job: u.job_title || '',
    co: u.company || '',
    ind: u.industry || '',
    region: u.region || '',
    role: u.role || '',
    lv: lv,
    isPaid: !!(u.is_paid || lv === 'VIP'),
    creditLv: creditLv,
    creditLvClass: creditLvClass(creditLv),
    lvBadgeClass: lvBadgeClass(creditLv),
    lvClass: lvClass(lv),
    bg: colors.bg,
    c: colors.c,
    bc: colors.bc,
    avatarUrl: resolveAvatarUrl(u.avatar_url),
    isFriend: isFriend,
    isSaved: !isFriend && saved,
    requestSent: status === 'pending_sent',
    pendingIn: status === 'pending_in',
    interactionCount: 0,
    tags: u.tags || []
  }
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    MY: {},
    regions: ['全部'].concat(constants.REGIONS),
    industries: ['全部'].concat(constants.INDUSTRIES),
    roles: ['全部', '企业主', '投资人', '销售', '专家', '合伙人'],
    fst: { region: '全部', industry: '全部', role: '全部' },
    openFilter: null,
    contactsTab: 'all',
    searchText: '',
    searchPanelOpen: false,
    searchKeyword: '',
    searchSearched: false,
    searchLoading: false,
    searchHistory: [],
    searchUsers: [],
    searchTasks: [],
    searchActivities: [],
    searchTotal: 0,
    selectedActivity: null,
    selectedTask: null,
    filteredMembers: [],
    displayFriends: [],
    friendGroupMode: 'group',
    friendGroups: [],
    memberPage: 1,
    memberPageSize: 20,
    memberHasMore: true,
    memberLoadingMore: false,
    activityCircle: [],
    activityCircleLoading: false,
    _allMembers: [],
    _friendIds: [],
    savedIds: [],
    inboxUnreadCount: 0,
    pendingRequests: [],
    friendsList: [],
    modal: null,
    drawerOpen: false,
    selectedMember: null,
    selectedMemberProfile: {},
    selectedMemberInteractions: [],
    selectedMemberCLV: {},
    shareTarget: {},
    shareSearch: '',
    shareFilteredFriends: [],
    shareSelectedIds: [],
    loading: true,
    loadError: '',
    overview: {
      reputation_level: '—',
      contribution_balance: 0,
      monthProfitYuan: '0.00',
      period: '',
      ready: false
    },
    matchLoading: false,
    matchResult: { users: [], tasks: [], activities: [], summary: '' },
    _inviteCode: '',
    _lastShareScene: ''
  },

  onLoad: function (options) {
    this.setData(layout.getPageInsets())
    this._searchTimer = null
    if (options && options.userId) {
      this._openUserId = parseInt(options.userId, 10)
    }
  },

  onUnload: function () {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (this._globalSearchTimer) clearTimeout(this._globalSearchTimer)
    if (this._drawerCloseTimer) clearTimeout(this._drawerCloseTimer)
  },

  onShow: function () {
    tabUtil.setTab(this, 0)
    var storedUserId = wx.getStorageSync('qm_open_user_id')
    if (storedUserId) {
      wx.removeStorageSync('qm_open_user_id')
      this._openUserId = parseInt(storedUserId, 10)
    }
    this._refreshInboxUnread()
    this._load()
    this._maybeShowProfileGuide()
  },

  onPullDownRefresh: function () {
    var self = this
    var jobs = [this._load()]
    if (this.data.contactsTab === 'circle') {
      jobs.push(this._loadActivityCircle())
    }
    Promise.all(jobs).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom: function () {
    if (!this.data.memberHasMore || this.data.memberLoadingMore) return
    if (this.data.contactsTab !== 'all') return
    var self = this
    var nextPage = this.data.memberPage + 1
    this.setData({ memberLoadingMore: true })
    var params = Object.assign({}, this.data.fst, { page: nextPage, page_size: 20 })
    if (params.industry && params.industry !== '全部') {
      params.industry = constants.industryForApi(params.industry)
    }
    api.users.list(params).then(function (data) {
      var currentUserId = (getApp().globalData.user || {}).id
      var newItems = (data.items || [])
        .filter(function (u) { return u.id !== currentUserId })
        .map(function (u) {
          return enrichUser(u, self.data._friendIds, self.data.savedIds)
        })
      var all = self.data._allMembers.concat(newItems)
      self.setData({
        _allMembers: all,
        filteredMembers: self._applyFilters(all),
        memberPage: nextPage,
        memberHasMore: newItems.length >= 20,
        memberLoadingMore: false
      })
    }).catch(function () {
      self.setData({ memberLoadingMore: false })
    })
  },

  _maybeShowProfileGuide: function () {
    if (!wx.getStorageSync('qm_show_guide')) return
    if (wx.getStorageSync('qm_guide_shown')) {
      wx.removeStorageSync('qm_show_guide')
      return
    }
    wx.removeStorageSync('qm_show_guide')
    wx.setStorageSync('qm_guide_shown', true)
    this.setData({ modal: 'guide' })
  },

  closeProfileGuide: function () {
    this.setData({ modal: null })
  },

  goProfileGuideEdit: function () {
    this.setData({ modal: null })
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' })
  },

  _refreshInboxUnread: function () {
    var self = this
    Promise.all([
      api.inbox.unreadCount().catch(function () { return { count: 0 } }),
      api.messages.unreadCount().catch(function () { return { total: 0 } })
    ]).then(function (results) {
      var notifyCount = (results[0] && results[0].count) || 0
      var dmCount = (results[1] && results[1].total) || 0
      self.setData({ inboxUnreadCount: notifyCount + dmCount })
    }).catch(function () {
      self.setData({ inboxUnreadCount: 0 })
    })
  },

  goInbox: function () {
    wx.navigateTo({ url: '/pages/inbox/inbox' })
  },

  onSearchFocus: function () {
    if (this.data.contactsTab !== 'all') return
    this.setData({
      searchPanelOpen: true,
      searchHistory: loadSearchHistory(),
      openFilter: null
    })
  },

  closeSearchPanel: function () {
    if (this._globalSearchTimer) clearTimeout(this._globalSearchTimer)
    this.setData({
      searchPanelOpen: false,
      searchKeyword: '',
      searchSearched: false,
      searchLoading: false,
      searchUsers: [],
      searchTasks: [],
      searchActivities: [],
      searchTotal: 0
    })
  },

  onSearchInput: function (e) {
    if (this.data.contactsTab !== 'all') return
    var self = this
    var value = e.detail.value || ''
    if (this._globalSearchTimer) clearTimeout(this._globalSearchTimer)
    this.setData({ searchKeyword: value, searchPanelOpen: true })
    if (!(value || '').trim()) {
      this.setData({
        searchSearched: false,
        searchLoading: false,
        searchUsers: [],
        searchTasks: [],
        searchActivities: [],
        searchTotal: 0,
        searchHistory: loadSearchHistory()
      })
      return
    }
    this._globalSearchTimer = setTimeout(function () {
      self.runGlobalSearch(value)
    }, 320)
  },

  onSearchConfirm: function () {
    this.runGlobalSearch(this.data.searchKeyword)
  },

  runGlobalSearch: function (keyword) {
    var self = this
    var kw = (keyword || '').trim()
    if (!kw) {
      wx.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }
    saveSearchHistory(kw)
    this.setData({
      searchKeyword: kw,
      searchSearched: true,
      searchLoading: true,
      searchHistory: loadSearchHistory(),
      searchUsers: [],
      searchTasks: [],
      searchActivities: [],
      searchTotal: 0
    })
    api.search.query(kw).then(function (data) {
      self.setData({
        searchLoading: false,
        searchUsers: (data.users || []).map(enrichSearchUser),
        searchTasks: (data.tasks || []).map(enrichSearchTask),
        searchActivities: (data.activities || []).map(enrichSearchActivity),
        searchTotal: data.total || 0
      })
    }).catch(function () {
      self.setData({
        searchLoading: false,
        searchUsers: [],
        searchTasks: [],
        searchActivities: [],
        searchTotal: 0
      })
    })
  },

  onSearchHistoryTap: function (e) {
    var kw = e.currentTarget.dataset.kw
    this.setData({ searchKeyword: kw })
    this.runGlobalSearch(kw)
  },

  clearSearchHistory: function () {
    wx.removeStorageSync(SEARCH_HISTORY_KEY)
    this.setData({ searchHistory: [] })
  },

  openSearchUser: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    this.closeSearchPanel()
    this.showMember({ currentTarget: { dataset: { id: id } } })
  },

  openSearchTask: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.tasks.detail(id).then(function (data) {
      if (!data) return
      self.closeSearchPanel()
      self.setData({ modal: 'taskDetail', selectedTask: enrichTaskFromApi(data) })
    }).catch(function () {
      wx.showToast({ title: '加载任务失败', icon: 'none' })
    })
  },

  openSearchActivity: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    Promise.all([
      api.activities.detail(id),
      api.activities.mySignups().catch(function () { return { ids: [] } })
    ]).then(function (results) {
      var data = results[0]
      var signupData = results[1]
      if (!data) return
      self.closeSearchPanel()
      self.setData({
        modal: 'activityDetail',
        selectedActivity: enrichActivityFromApi(data, signupData.ids || [])
      })
    }).catch(function () {
      wx.showToast({ title: '加载活动失败', icon: 'none' })
    })
  },

  confirmSearchActivitySignup: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.activities.signup(id).then(function () {
      wx.showToast({ title: '报名成功', icon: 'success' })
      return api.activities.detail(id)
    }).then(function (data) {
      if (!data) return
      return api.activities.mySignups().catch(function () { return { ids: [] } }).then(function (signupData) {
        self.setData({
          selectedActivity: enrichActivityFromApi(data, signupData.ids || [])
        })
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '报名失败', icon: 'none' })
    })
  },

  goTasksTab: function () {
    this.closeModal()
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  _load: function () {
    var self = this
    var app = getApp()
    var user = app.globalData.user || {}
    this.setData({ MY: { name: user.name || '', inviteCode: '' }, loading: true, loadError: '' })

    function afterMe(me) {
      app.globalData.user = Object.assign({}, app.globalData.user, me)
      self.setData({ MY: { name: me.name || '', inviteCode: me.invite_code || '' } })
      if (me.id) {
        return api.users.detail(me.id).then(function (detail) {
          profileGuide.maybeSetShowGuide(me, detail && detail.card)
        }).catch(function () {
          profileGuide.maybeSetShowGuide(me, null)
        }).then(function () {
          self._maybeShowProfileGuide()
        })
      }
      profileGuide.maybeSetShowGuide(me, null)
      self._maybeShowProfileGuide()
      return Promise.resolve()
    }

    var params = Object.assign({}, self.data.fst)
    if (params.industry && params.industry !== '全部') {
      params.industry = constants.industryForApi(params.industry)
    }
    Object.assign(params, { page: 1, page_size: 20 })

    var meP = api.auth.me().then(afterMe).catch(function () {})

    var listP = Promise.all([
      api.users.list(params),
      api.friends.list(),
      api.friends.pending(),
      api.friends.savedCards().catch(function () { return { ids: [], items: [] } }),
      api.credit.balance().catch(function () { return null }),
      api.profit.dashboard().catch(function () { return null })
    ]).then(function (results) {
      var usersData = results[0]
      var friendsData = results[1]
      var pendingData = results[2]
      var savedData = results[3]
      var creditBal = results[4]
      var profitDash = results[5]
      var overview = {
        reputation_level: (creditBal && creditBal.reputation_level) || (app.globalData.user || {}).reputation_level || '—',
        contribution_balance: (creditBal && creditBal.contribution_balance) != null ? creditBal.contribution_balance : 0,
        monthProfitYuan: fenToYuan(profitDash && profitDash.month_total),
        period: (profitDash && profitDash.period) || '',
        ready: true
      }
      var currentUserId = (app.globalData.user || {}).id
      var friendIds = (friendsData.items || []).map(function (f) { return f.id })
      var savedIds = savedData.ids || (savedData.items || []).map(function (x) { return x.user_id || x.id })

      var members = (usersData.items || [])
        .filter(function (u) { return u.id !== currentUserId })
        .map(function (u) { return enrichUser(u, friendIds, savedIds) })
      var hasMore = (usersData.items || []).length >= 20

      var friends = (friendsData.items || []).map(mapFriendFromApi)
      var friendGroups = buildFriendGroups(friends, self.data.friendGroupMode)

      var pendingSeen = {}
      var pending = []
      ;(pendingData.items || []).forEach(function (r) {
        if (pendingSeen[r.from_user_id]) return
        pendingSeen[r.from_user_id] = true
        var colors = avatarColors(r.from_user_id)
        var jobLine = (r.job_title || '') + (r.company ? ' · ' + r.company : '')
        pending.push({
          from: r.request_id,
          from_user_id: r.from_user_id,
          name: r.name || '',
          job: jobLine || '申请互换名片',
          msg: r.msg || '',
          nameAbbr: (r.name || '').slice(0, 2),
          bg: colors.bg,
          c: colors.c,
          bc: colors.bc,
          avatarUrl: resolveAvatarUrl(r.avatar_url)
        })
      })

      self.setData({
        _allMembers: members,
        _friendIds: friendIds,
        savedIds: savedIds,
        friendsList: friends,
        displayFriends: friends,
        friendGroups: friendGroups,
        pendingRequests: pending,
        filteredMembers: self._applyFilters(members),
        overview: overview,
        memberPage: 1,
        memberHasMore: hasMore,
        loading: false,
        loadError: ''
      })
      tabUtil.setTab(self, 0, { hasPending: pending.length > 0 })

      if (self._openUserId) {
        var uid = self._openUserId
        self._openUserId = null
        self.showMember({ currentTarget: { dataset: { id: uid } } })
      }
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : '加载失败，请检查后端是否启动'
      self.setData({ loading: false, loadError: msg, filteredMembers: [] })
    })

    return Promise.all([meP, listP])
  },

  _applyFilters: function (members) {
    var fst = this.data.fst
    var mems = members || this.data._allMembers
    var filtered = mems.filter(function (m) {
      if (fst.region !== '全部' && m.region !== fst.region) return false
      if (fst.industry !== '全部' && m.ind !== fst.industry) return false
      if (fst.role !== '全部' && m.role !== fst.role) return false
      return true
    })
    filtered.sort(function (a, b) {
      return friendSortRank(a) - friendSortRank(b)
    })
    return filtered
  },

  switchContactsTab: function (e) {
    var tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.contactsTab) return
    this.setData({ contactsTab: tab })
    if (tab === 'circle') {
      this._loadActivityCircle()
    }
  },

  switchFriendGroupMode: function (e) {
    var mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.friendGroupMode) return
    this.setData({
      friendGroupMode: mode,
      friendGroups: buildFriendGroups(this.data.friendsList, mode)
    })
  },

  _loadActivityCircle: function () {
    var self = this
    this.setData({ activityCircleLoading: true })
    return api.users.activityCircle().then(function (data) {
      var items = (data.items || []).map(function (item) {
        var colors = avatarColors(item.id)
        return Object.assign({}, item, {
          bg: colors.bg,
          c: colors.c,
          bc: colors.bc,
          avatarUrl: item.is_expired ? '' : resolveAvatarUrl(item.avatar_url)
        })
      })
      self.setData({ activityCircle: items, activityCircleLoading: false })
    }).catch(function () {
      self.setData({ activityCircle: [], activityCircleLoading: false })
    })
  },

  addFriendFromCircle: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.friends.add(id, '活动圈认识').then(function (res) {
      if (res && res.hint === 'incoming') {
        wx.showToast({ title: '对方已申请，请在申请栏接受', icon: 'none' })
      } else {
        wx.showToast({ title: '申请已发送', icon: 'success' })
      }
      self._load()
      if (self.data.contactsTab === 'circle') {
        self._loadActivityCircle()
      }
    }).catch(function () {})
  },

  toggleFilter: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ openFilter: this.data.openFilter === key ? null : key })
  },

  setFilter: function (e) {
    if (this.data.contactsTab !== 'all') return
    var self = this
    var key = e.currentTarget.dataset.key
    var value = e.currentTarget.dataset.value
    var fst = Object.assign({}, this.data.fst)
    fst[key] = value
    this.setData({ fst: fst, openFilter: null }, function () {
      self._load()
    })
  },

  showMember: function (e) {
    if (e.currentTarget.dataset.expired === 1 || e.currentTarget.dataset.expired === '1') {
      wx.showToast({ title: '相识超过15天，信息已保护', icon: 'none' })
      return
    }
    var self = this
    var id = e.currentTarget.dataset.id
    api.users.detail(id).then(function (data) {
      if (!data) return
      var colors = avatarColors(data.id)
      var status = data.friend_status || (self.data._friendIds.indexOf(data.id) !== -1 ? 'friend' : 'none')
      var isFriend = status === 'friend'
      var creditLv = data.reputation_level || 'A'
      var lv = data.is_paid ? 'VIP' : '标准'
      var card = data.card || {}
      var pendingReq = null
      ;(self.data.pendingRequests || []).forEach(function (r) {
        if (r.from_user_id === data.id) pendingReq = r
      })
      var enriched = {
        id: data.id,
        name: data.name || '',
        nameAbbr: (data.name || '').slice(0, 2),
        job: card.job_title || '',
        co: card.company || '',
        ind: card.industry || '',
        region: card.region || '',
        lv: lv,
        creditLv: creditLv,
        creditLvClass: creditLvClass(creditLv),
        lvBadgeClass: lvBadgeClass(creditLv),
        lvClass: lvClass(lv),
        bg: colors.bg,
        c: colors.c,
        bc: colors.bc,
        avatarUrl: resolveAvatarUrl(data.avatar_url),
        isFriend: isFriend,
        isSaved: !isFriend && self.data.savedIds.indexOf(data.id) !== -1,
        requestSent: status === 'pending_sent',
        pendingIn: status === 'pending_in',
        pendingRequestId: pendingReq ? pendingReq.from : null
      }
      var profile = buildDigitalCard(data, isFriend)
      self.setData({
        selectedMember: enriched,
        selectedMemberProfile: profile,
        selectedMemberInteractions: [],
        selectedMemberCLV: CLV[creditLv] || CLV.A,
        drawerOpen: false
      }, function () {
        setTimeout(function () {
          self.setData({ drawerOpen: true })
        }, 30)
      })
    }).catch(function () {})
  },

  saveCard: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.friends.saveCard(id).then(function (res) {
      if (res && res.hint === 'already_friend') {
        wx.showToast({ title: '已是好友', icon: 'none' })
        self._load()
        return
      }
      wx.showToast({ title: '已保存名片', icon: 'success' })
      self._load()
    }).catch(function () {})
  },

  unsaveCard: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    api.friends.unsaveCard(id).then(function () {
      wx.showToast({ title: '已取消保存', icon: 'none' })
      self._load()
    }).catch(function () {})
  },

  exchangeCard: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id && self.data.selectedMember) id = self.data.selectedMember.id
    var member = this.data.selectedMember
    if (member && member.requestSent) {
      wx.showToast({ title: '申请已发送', icon: 'none' })
      return
    }
    if (member && member.pendingIn) {
      wx.showToast({ title: '请先接受申请', icon: 'none' })
      return
    }
    api.friends.add(id, '互换名片').then(function (res) {
      if (res && res.hint === 'incoming') {
        wx.showToast({ title: '对方已申请', icon: 'none' })
        if (member) {
          self.setData({
            'selectedMember.pendingIn': true,
            'selectedMember.requestSent': false
          })
        }
        self._load()
        return
      }
      wx.showToast({ title: '申请已发送', icon: 'success' })
      if (member && member.id === id) {
        self.setData({ 'selectedMember.requestSent': true })
      }
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    })
  },

  acceptPendingInDrawer: function () {
    var self = this
    var member = this.data.selectedMember
    var reqId = member && member.pendingRequestId
    if (!reqId) {
      wx.showToast({ title: '未找到申请', icon: 'none' })
      return
    }
    api.friends.accept(reqId).then(function () {
      wx.showToast({ title: '已互换名片', icon: 'success' })
      api.users.detail(member.id).then(function (data) {
        if (!data) return
        var profile = buildDigitalCard(data, true)
        self.setData({
          selectedMember: Object.assign({}, member, {
            isFriend: true,
            pendingIn: false,
            requestSent: false,
            pendingRequestId: null
          }),
          selectedMemberProfile: profile
        })
        self._load()
      }).catch(function () {
        self._load()
      })
    }).catch(function () {
      wx.showToast({ title: '接受失败', icon: 'none' })
    })
  },

  dismissPendingInDrawer: function () {
    var self = this
    var member = this.data.selectedMember
    var reqId = member && member.pendingRequestId
    if (!reqId) {
      self.closeModal()
      return
    }
    api.friends.reject(reqId).then(function () {
      wx.showToast({ title: '已忽略', icon: 'none' })
      self.setData({
        selectedMember: Object.assign({}, member, {
          pendingIn: false,
          pendingRequestId: null
        })
      })
      self._load()
    }).catch(function () {
      self._load()
    })
  },

  callPhone: function () {
    var phone = (this.data.selectedMemberProfile || {}).phone
    if (!phone) {
      wx.showToast({ title: '暂无手机号', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  copyEmail: function () {
    var email = (this.data.selectedMemberProfile || {}).email
    if (!email) {
      wx.showToast({ title: '暂无邮箱', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: email,
      success: function () {
        wx.showToast({ title: '邮箱已复制', icon: 'success' })
      }
    })
  },

  sendMessage: function () {
    var member = this.data.selectedMember
    if (!member || !member.id) {
      wx.showToast({ title: '请先选择联系人', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/chat/chat?userId=' + member.id + '&userName=' + encodeURIComponent(member.name || '')
    })
  },

  shareCard: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var member = this.data.selectedMember
    if (!member || member.id !== id) {
      member = (this.data.filteredMembers || []).find(function (m) { return m.id === id })
    }
    if (!member) return
    var profile = this.data.selectedMemberProfile || {}
    var filtered = filterShareFriends(this.data.friendsList, '')
    this.setData({
      modal: 'share',
      shareTarget: Object.assign({}, member, {
        nameAbbr: (member.name || '').slice(0, 2),
        job: member.job || profile.headline || '',
        co: member.co || profile.companyFull || '',
        region: member.region || '',
        lv: member.lv || '标准',
        avatarUrl: member.avatarUrl || profile.avatarUrl || ''
      }),
      shareSearch: '',
      shareSelectedIds: [],
      shareFilteredFriends: markShareFriendsSelected(filtered, [])
    })
  },

  onShareSearch: function (e) {
    var search = e.detail.value || ''
    var filtered = filterShareFriends(this.data.friendsList, search)
    this.setData({
      shareSearch: search,
      shareFilteredFriends: markShareFriendsSelected(filtered, this.data.shareSelectedIds)
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
      shareFilteredFriends: markShareFriendsSelected(this.data.shareFilteredFriends, ids)
    })
  },

  sendCardTo: function () {
    var self = this
    var ids = (this.data.shareSelectedIds || []).map(function (id) {
      return parseInt(id, 10)
    }).filter(function (id) { return !!id })
    if (!ids.length) {
      wx.showToast({ title: '请先选择好友', icon: 'none' })
      return
    }
    var target = this.data.shareTarget
    var cardUserId = target && parseInt(target.id, 10)
    if (!cardUserId) {
      wx.showToast({ title: '名片信息无效', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发送中', mask: true })
    api.inbox.shareCard({
      card_user_id: cardUserId,
      to_user_ids: ids
    }).then(function (data) {
      wx.hideLoading()
      var n = (data && data.sent) || ids.length
      wx.showToast({ title: '已发送给 ' + n + ' 位好友', icon: 'success' })
      self._clearShareModalState()
      self.setData({ modal: null })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    })
  },

  onShareAppMessage: function () {
    if (this.data.modal === 'invite' || this.data._lastShareScene === 'invite') {
      return {
        title: '邀请你加入企盟，拓展优质人脉',
        path: '/pages/login/login?ref=' + (this.data._inviteCode || '')
      }
    }
    var t = this.data.shareTarget
    if (this.data.modal === 'share' && t && t.id) {
      return {
        title: (t.name || '用户') + '的名片',
        path: '/pages/contacts/contacts?userId=' + t.id
      }
    }
    return {
      title: '企盟',
      path: '/pages/contacts/contacts'
    }
  },

  genPoster: function () {
    wx.showToast({ title: '名片海报生成中，敬请期待', icon: 'none' })
  },

  _clearShareModalState: function () {
    this.setData({
      shareSearch: '',
      shareSelectedIds: [],
      shareFilteredFriends: []
    })
  },

  showPendingModal: function () {
    this.setData({ modal: 'pending' })
  },

  showInviteModal: function () { this.setData({ modal: 'invite' }) },

  copyInviteCode: function () {
    var code = (this.data.MY || {}).inviteCode || ''
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  shareProgram: function () {
    var self = this
    api.channel.myLink().then(function (data) {
      var code = (data && data.invite_code) || ''
      self.setData({ _inviteCode: code, _lastShareScene: 'invite' })
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] })
    }).catch(function () {
      self.setData({ _lastShareScene: 'invite' })
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] })
    })
  },

  acceptRequest: function (e) {
    var self = this
    var reqId = e.currentTarget.dataset.id
    api.friends.accept(reqId).then(function () {
      self.setData({ modal: 'pending' })
      self._load()
    }).catch(function () {
      self._load()
    })
  },

  rejectRequest: function (e) {
    var self = this
    var reqId = e.currentTarget.dataset.id
    api.friends.reject(reqId).then(function () {
      self._load()
    }).catch(function () {
      self._load()
    })
  },

  onSmartMatch: function () {
    var self = this
    if (self.data.matchLoading) return
    self.setData({ matchLoading: true })
    api.ai.match({ keywords: [], scene: 'resource' }).then(function (data) {
      var users = (data && data.users) || []
      var tasks = (data && data.tasks) || []
      var activities = (data && data.activities) || []
      var parts = []
      if (users.length) parts.push('用户 ' + users.length + ' 人')
      if (tasks.length) parts.push('任务 ' + tasks.length + ' 个')
      if (activities.length) parts.push('活动 ' + activities.length + ' 场')
      self.setData({
        matchLoading: false,
        modal: 'match',
        matchResult: {
          users: users.slice(0, 5),
          tasks: tasks.slice(0, 5),
          activities: activities.slice(0, 5),
          summary: parts.length ? parts.join(' · ') : '暂无匹配结果，请完善名片标签后重试'
        }
      })
    }).catch(function () {
      self.setData({ matchLoading: false })
    })
  },

  openMatchUser: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    this.setData({ modal: null })
    this.showMember({ currentTarget: { dataset: { id: id } } })
  },

  openMatchTask: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.setStorageSync('qm_open_task_id', id)
    this.setData({ modal: null })
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  openMatchActivity: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.setStorageSync('qm_open_activity_id', id)
    this.setData({ modal: null })
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  closeModal: function () {
    var self = this
    if (this.data.modal === 'taskDetail' || this.data.modal === 'activityDetail') {
      this.setData({ modal: null, selectedTask: null, selectedActivity: null })
      return
    }
    if (this.data.modal && this.data.modal !== 'member') {
      if (this.data.modal === 'share') {
        this._clearShareModalState()
        this.setData({ modal: null, drawerOpen: true })
        return
      }
      if (this.data.modal === 'guide') {
        this.setData({ modal: null })
        return
      }
      this.setData({ modal: null })
      return
    }
    if (this.data.drawerOpen || this.data.selectedMember) {
      this.setData({ drawerOpen: false, modal: null })
      if (this._drawerCloseTimer) clearTimeout(this._drawerCloseTimer)
      this._drawerCloseTimer = setTimeout(function () {
        self.setData({
          selectedMember: null,
          selectedMemberProfile: {},
          selectedMemberInteractions: [],
          selectedMemberCLV: {}
        })
      }, 300)
      return
    }
    this.setData({ modal: null })
  },
  stopProp: function () {}
})
