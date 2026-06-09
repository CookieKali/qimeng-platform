var config = require('../config')

function networkTip(errMsg) {
  var msg = errMsg || ''
  if (msg.indexOf('ERR_NETWORK_CHANGED') >= 0 || msg.indexOf('network changed') >= 0) {
    if (config.isDevtools()) {
      return '网络已切换，请重新编译；模拟器应连 localhost:8000'
    }
    return '网络已切换，请运行 ./scripts/sync_api_host.sh 后重新打开小程序'
  }
  if (config.isDevtools()) {
    return '无法连接后端，请运行 ./scripts/start_backend.sh'
  }
  return '真机无法连接后端：同一 WiFi + ./scripts/sync_api_host.sh'
}

function formatRequestFail(err) {
  var tip = networkTip(err && err.errMsg)
  if (config.isDevtools()) {
    return tip + '（' + config.resolveApiBase() + '）'
  }
  return tip
}

var AVOS = [
  { bg: '#0c1e38', c: '#5cb8ff', bc: '#1a4a8a' },
  { bg: '#061e12', c: '#28e880', bc: '#0f4030' },
  { bg: '#1a1540', c: '#b0a0ff', bc: '#2a1e60' },
  { bg: '#1e0a06', c: '#ff8848', bc: '#3a1a08' },
  { bg: '#1e1408', c: '#d8a030', bc: '#3a2810' },
  { bg: '#0a1e06', c: '#78c828', bc: '#1a3010' },
  { bg: '#1a0a14', c: '#d880b0', bc: '#3a1a28' },
  { bg: '#081020', c: '#60c8e0', bc: '#1a3a50' }
]

var CLV = {
  SSS: { cls: 'psss', label: 'SSS', score: '900–1000', fee: '2%' },
  SS:  { cls: 'pss',  label: 'SS',  score: '800–899',  fee: '3.5%' },
  S:   { cls: 'ps2',  label: 'S',   score: '700–799',  fee: '4%' },
  A:   { cls: 'pa2',  label: 'A',   score: '600–699',  fee: '5%' },
  B:   { cls: 'pb2',  label: 'B',   score: '500–599',  fee: '5%' },
  C:   { cls: 'pc2',  label: 'C',   score: '400–499',  fee: '6%' },
  D:   { cls: 'pd2',  label: 'D',   score: '<400',     fee: '—' }
}

function avatarColors(id) {
  var idx = (typeof id === 'number' ? id : parseInt(id) || 0) % AVOS.length
  return AVOS[idx]
}

function creditLvClass(lv) {
  return (CLV[lv] || CLV.A).cls
}

function lvClass(lv) {
  if (lv === '创始合伙人' || lv === 'partner') return 'pp'
  if (lv === 'VIP' || lv === 'paid') return 'pa'
  return 'pb'
}

function parseBodyError(body, fallback) {
  fallback = fallback || '请求失败'
  if (!body) return fallback
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return body || fallback
    }
  }
  if (body.msg) return body.msg
  var detail = body.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map(function (item) {
      if (typeof item === 'string') return item
      return item.msg || item.message || JSON.stringify(item)
    }).join('；')
  }
  return fallback
}

function parseHttpError(res) {
  return parseBodyError(res && res.data, '请求失败')
}

function parseResponseBody(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    var text = raw.trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (e) {
      return null
    }
  }
  return null
}

function isApiSuccess(statusCode, body) {
  if (statusCode < 200 || statusCode >= 300) return false
  if (!body) return true
  if (body.code === undefined || body.code === null) return true
  return Number(body.code) === 0
}

function request(url, method, data, needAuth, options) {
  if (method === undefined) method = 'GET'
  if (needAuth === undefined) needAuth = true
  options = options || {}
  return new Promise(function (resolve, reject) {
    var header = { 'Content-Type': 'application/json' }
    if (needAuth) {
      var token = wx.getStorageSync('qm_token')
      if (!token) {
        var noAuthMsg = '未登录，请重新登录'
        if (!options.silent) wx.showToast({ title: noAuthMsg, icon: 'none' })
        reject(new Error(noAuthMsg))
        return
      }
      header['Authorization'] = 'Bearer ' + token
    }
    var httpMethod = (method || 'GET').toUpperCase()
    var payload = data == null ? {} : data
    var sendData = payload
    // 模拟器：POST 传 object 由微信自动序列化；真机 POST/PUT/PATCH 手动 stringify
    var isDevtools = config.isDevtools()
    if (httpMethod === 'PUT' || httpMethod === 'PATCH') {
      if (typeof payload === 'object') sendData = JSON.stringify(payload)
    } else if (httpMethod === 'POST' && !isDevtools && typeof payload === 'object') {
      sendData = JSON.stringify(payload)
    }
    wx.request({
      url: config.resolveApiBase() + url,
      method: httpMethod,
      data: sendData,
      header: header,
      success: function (res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('qm_token')
          wx.reLaunch({ url: '/pages/login/login' })
          reject(new Error('未登录'))
          return
        }
        var body = parseResponseBody(res.data)
        if (isApiSuccess(res.statusCode, body)) {
          resolve(body && body.data !== undefined ? body.data : null)
          return
        }
        var msg = parseBodyError(body, '请求失败')
        if (!options.silent) wx.showToast({ title: msg, icon: 'none' })
        reject(new Error(msg))
      },
      fail: function (err) {
        var tip = formatRequestFail(err)
        if (!options.silent) wx.showToast({ title: tip, icon: 'none', duration: 3000 })
        reject(new Error(tip))
      }
    })
  })
}

function resolveAvatarUrl(url) {
  if (!url) return ''
  var s = String(url).trim()
  if (!s) return ''
  if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0 || s.indexOf('wxfile://') === 0) {
    return s
  }
  var base = config.resolveApiBase().replace(/\/$/, '')
  if (s.charAt(0) !== '/') s = '/' + s
  return base + s
}

function uploadFile(url, filePath, name) {
  name = name || 'file'
  return new Promise(function (resolve, reject) {
    var header = {}
    var token = wx.getStorageSync('qm_token')
    if (token) header.Authorization = 'Bearer ' + token
    wx.uploadFile({
      url: config.resolveApiBase() + url,
      filePath: filePath,
      name: name,
      header: header,
      success: function (res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('qm_token')
          wx.reLaunch({ url: '/pages/login/login' })
          reject(new Error('未登录'))
          return
        }
        var body = null
        try {
          body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch (e) {
          reject(new Error('上传失败'))
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          var msg = parseBodyError(body, '上传失败')
          wx.showToast({ title: msg, icon: 'none', duration: 2500 })
          reject(new Error(msg))
        }
      },
      fail: function (err) {
        var tip = formatRequestFail(err)
        wx.showToast({ title: tip, icon: 'none' })
        reject(new Error(tip))
      }
    })
  })
}

function qs(params) {
  var parts = []
  for (var k in params) {
    var v = params[k]
    if (v !== undefined && v !== '' && v !== '全部') {
      parts.push(k + '=' + encodeURIComponent(v))
    }
  }
  return parts.length ? '?' + parts.join('&') : ''
}

var api = {
  auth: {
    login: function (phone, password) {
      return request('/api/auth/login', 'POST', { phone: phone, password: password }, false)
    },
    register: function (d) {
      return request('/api/auth/register', 'POST', d, false)
    },
    me: function () { return request('/api/auth/me') },
    updateMe: function (d) { return request('/api/auth/me', 'POST', d, true, { silent: true }) },
    wxBind: function (code) {
      return request('/api/auth/wx-bind', 'POST', { code: code })
    }
  },
  payment: {
    prepayMembership: function (orderId) {
      return request('/api/v1/payment/membership/' + orderId + '/prepay', 'POST')
    }
  },
  profile: {
    get: function () { return request('/api/v1/profile/') },
    update: function (d) { return request('/api/v1/profile/', 'POST', d, true, { silent: true }) },
    patch: function (d) { return request('/api/v1/profile/', 'POST', d, true, { silent: true }) },
    saveAll: function (d) { return request('/api/v1/profile/save-all', 'POST', d, true, { silent: true }) }
  },
  users: {
    list: function (params) { return request('/api/users/' + qs(params || {})) },
    detail: function (id) { return request('/api/users/' + id) },
    activityCircle: function () { return request('/api/v1/users/activity-circle') },
    uploadAvatar: function (filePath) {
      return uploadFile('/api/v1/users/me/avatar', filePath, 'file')
    },
    deleteAvatar: function () {
      return request('/api/v1/users/me/avatar', 'DELETE')
    }
  },
  tasks: {
    list: function (params) { return request('/api/v1/tasks/' + qs(params || {})) },
    detail: function (id) { return request('/api/v1/tasks/' + id) },
    my: function () { return request('/api/v1/tasks/my') },
    create: function (d) { return request('/api/v1/tasks/', 'POST', d) },
    join: function (id) { return request('/api/v1/tasks/' + id + '/join', 'POST') },
    complete: function (id) { return request('/api/v1/tasks/' + id + '/complete', 'PATCH') },
    deliver: function (taskId, content) {
      return request('/api/v1/tasks/' + taskId + '/deliver', 'POST', {
        content: content || '',
        attachments: []
      })
    },
    deliveries: function (taskId) {
      return request('/api/v1/tasks/' + taskId + '/deliveries')
    },
    reviewDelivery: function (taskId, deliveryId, action, reason, scores) {
      var body = { action: action }
      if (reason) body.reason = reason
      if (scores) {
        body.score_performance = scores.performance
        body.score_quality = scores.quality
        body.score_professional = scores.professional
        body.score_compliance = scores.compliance
      }
      return request(
        '/api/v1/tasks/' + taskId + '/deliveries/' + deliveryId + '/review',
        'POST',
        body
      )
    },
    appeal: function (taskId, reason) {
      return request('/api/v1/tasks/' + taskId + '/appeal', 'POST', { reason: reason || '' })
    },
    myAppeals: function () { return request('/api/v1/tasks/appeals/my') },
    appeals: function (taskId) { return request('/api/v1/tasks/' + taskId + '/appeals') },
    applicants: function (taskId) {
      return request('/api/v1/tasks/' + taskId + '/applicants')
    },
    cancel: function (taskId) {
      return request('/api/v1/tasks/' + taskId + '/cancel', 'PATCH')
    },
    update: function (taskId, d) {
      return request('/api/v1/tasks/' + taskId, 'PATCH', d)
    },
    accept: function (taskId, participantId) {
      return request('/api/v1/tasks/' + taskId + '/accept/' + participantId, 'POST')
    },
    uploadCover: function (filePath) {
      return uploadFile('/api/v1/tasks/cover', filePath, 'file')
    }
  },
  activities: {
    list: function (params) { return request('/api/activities/' + qs(params || {})) },
    detail: function (id) { return request('/api/activities/' + id) },
    create: function (d) { return request('/api/activities/', 'POST', d) },
    update: function (id, d) { return request('/api/activities/' + id, 'PATCH', d) },
    signup: function (id) { return request('/api/activities/' + id + '/signup', 'POST') },
    my: function () { return request('/api/activities/my') },
    mySignups: function () { return request('/api/activities/my/signups') },
    checkin: function (id) { return request('/api/v1/activities/' + id + '/checkin', 'POST') },
    attendees: function (id, params) {
      return request('/api/v1/activities/' + id + '/attendees' + qs(params || {}))
    },
    signin: function (activityId, userId) {
      return request('/api/v1/activities/' + activityId + '/signin/' + userId, 'POST')
    },
    cancel: function (id) {
      return request('/api/activities/' + id + '/cancel', 'PATCH')
    },
    uploadCover: function (filePath) {
      return uploadFile('/api/v1/activities/cover', filePath, 'file')
    }
  },
  spaces: {
    list: function (params) { return request('/api/spaces/' + qs(params || {})) },
    stations: function () { return request('/api/spaces/stations/') },
    stationDetail: function (id) { return request('/api/spaces/stations/' + id) },
    book: function (d) { return request('/api/spaces/book', 'POST', d) },
    myBookings: function () { return request('/api/v1/spaces/my-bookings') },
    cancelBooking: function (id) {
      return request('/api/v1/spaces/bookings/' + id, 'DELETE')
    }
  },
  friends: {
    list: function () { return request('/api/friends/') },
    pending: function () { return request('/api/friends/requests/pending') },
    sent: function () { return request('/api/friends/requests/sent') },
    add: function (toId, msg) {
      return request('/api/friends/request/' + toId + '?msg=' + encodeURIComponent(msg || ''), 'POST')
    },
    accept: function (reqId) { return request('/api/friends/requests/' + reqId + '/accept', 'POST') },
    reject: function (reqId) { return request('/api/friends/requests/' + reqId + '/reject', 'POST') },
    savedCards: function () { return request('/api/v1/friends/saved') },
    saveCard: function (userId) {
      return request('/api/v1/friends/save-card', 'POST', { user_id: userId })
    },
    unsaveCard: function (userId) {
      return request('/api/v1/friends/save-card/' + userId, 'DELETE')
    }
  },
  credit: {
    balance: function () { return request('/api/v1/credit/balance') },
    transactions: function () { return request('/api/v1/credit/transactions') },
    recharge: function (amount) {
      return request('/api/v1/credit/recharge', 'POST', { amount: amount })
    }
  },
  membership: {
    createOrder: function (tier) {
      return request('/api/v1/membership/orders', 'POST', { tier: tier })
    },
    myOrders: function () { return request('/api/v1/membership/orders/my') },
    mockPay: function (orderId) {
      return request('/api/v1/membership/orders/' + orderId + '/mock-pay', 'POST')
    },
    prepay: function (orderId) {
      return request('/api/v1/payment/membership/' + orderId + '/prepay', 'POST')
    },
    quota: function (opts) { return request('/api/v1/membership/quota/my', 'GET', null, true, opts) }
  },
  profit: {
    dashboard: function (opts) { return request('/api/v1/profit/dashboard', 'GET', null, true, opts) },
    records: function (p, opts) {
      return request('/api/v1/profit/records' + qs(p || {}), 'GET', null, true, opts)
    },
    referrals: function (opts) { return request('/api/v1/profit/referrals', 'GET', null, true, opts) },
    confirm: function (recordId) {
      return request('/api/v1/profit/records/' + recordId + '/confirm', 'POST')
    }
  },
  channel: {
    myLink: function (opts) { return request('/api/v1/channel/my-link', 'GET', null, true, opts) },
    summary: function (opts) { return request('/api/v1/channel/summary', 'GET', null, true, opts) }
  },
  ai: {
    match: function (body) { return request('/api/v1/ai/match', 'POST', body || {}) }
  },
  search: {
    query: function (q) { return request('/api/v1/search' + qs({ q: q || '' })) }
  },
  messages: {
    send: function (toUserId, content) {
      return request('/api/v1/messages/send', 'POST', {
        to_user_id: toUserId,
        content: content || ''
      })
    },
    conversation: function (userId) {
      return request('/api/v1/messages/conversation/' + userId)
    },
    conversations: function () {
      return request('/api/v1/messages/conversations')
    },
    unreadCount: function () {
      return request('/api/v1/messages/unread-count')
    }
  },
  inbox: {
    send: function (d) { return request('/api/v1/inbox/send', 'POST', d) },
    shareCard: function (d) { return request('/api/v1/inbox/share-card', 'POST', d) },
    shareTask: function (d) { return request('/api/v1/inbox/share-task', 'POST', d) },
    shareActivity: function (d) { return request('/api/v1/inbox/share-activity', 'POST', d) },
    list: function (params) { return request('/api/v1/inbox/list' + qs(params || {})) },
    markRead: function (id) { return request('/api/v1/inbox/' + id + '/read', 'PATCH') },
    markAllRead: function () { return request('/api/v1/inbox/read-all', 'POST', {}) },
    unreadCount: function () { return request('/api/v1/inbox/unread-count') }
  },
  reputation: {
    get: function () { return request('/api/v1/reputation/') }
  },
  contribution: {
    balance: function () { return request('/api/v1/contribution/balance') },
    consume: function (scene, tType, tId) {
      var body = { scene: scene }
      if (tType != null && tType !== undefined && tType !== '') {
        body.target_type = tType
      }
      if (tId != null && tId !== undefined && tId !== '') {
        body.target_id = tId
      }
      return request('/api/v1/contribution/consume', 'POST', body)
    },
    list: function () { return request('/api/v1/credit/contribution') }
  },
  cardShares: {
    create: function (shareType, shareChannel) {
      return request('/api/v1/card-shares/create', 'POST', { share_type: shareType, share_channel: shareChannel || null })
    },
    myShares: function () {
      return request('/api/v1/card-shares/my-shares')
    },
    trace: function (shareCode) {
      return request('/api/v1/card-shares/trace/' + shareCode, 'GET', {}, false)
    }
  },
  admin: {
    bookings: function (params) { return request('/api/admin/bookings' + qs(params || {})) },
    bookingDetail: function (id) { return request('/api/admin/bookings/' + id) },
    auditBooking: function (id, d) { return request('/api/admin/bookings/' + id + '/audit', 'POST', d) }
  }
}

module.exports = {
  api: api,
  CLV: CLV,
  AVOS: AVOS,
  avatarColors: avatarColors,
  creditLvClass: creditLvClass,
  lvClass: lvClass,
  resolveAvatarUrl: resolveAvatarUrl
}
