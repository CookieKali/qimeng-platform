var config = require('../config')

function networkTip() {
  if (config.isDevtools()) {
    return '网络错误，请先运行 ./scripts/start_backend.sh'
  }
  return '真机无法连接后端：请同一 WiFi，并运行 sync_api_host.sh 更新 IP'
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

function parseHttpError(res) {
  var body = res && res.data
  if (!body) return '请求失败'
  if (body.msg) return body.msg
  var detail = body.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map(function (item) {
      if (typeof item === 'string') return item
      return item.msg || item.message || JSON.stringify(item)
    }).join('；')
  }
  return '请求失败'
}

function request(url, method, data, needAuth) {
  if (method === undefined) method = 'GET'
  if (needAuth === undefined) needAuth = true
  return new Promise(function (resolve, reject) {
    var header = { 'Content-Type': 'application/json' }
    if (needAuth) {
      var token = wx.getStorageSync('qm_token')
      if (token) header['Authorization'] = 'Bearer ' + token
    }
    var httpMethod = (method || 'GET').toUpperCase()
    var payload = data == null ? {} : data
    var sendData = payload
    // WeChat: only POST + application/json auto-serializes objects.
    // PUT/PATCH must be JSON string; POST should stay as object.
    if (httpMethod === 'PUT' || httpMethod === 'PATCH') {
      if (typeof payload === 'object') {
        sendData = JSON.stringify(payload)
      }
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          var body = res.data
          if (body && body.code === 0) {
            resolve(body.data)
          } else {
            var msg = (body && body.msg) || '请求失败'
            wx.showToast({ title: msg, icon: 'none' })
            reject(new Error(msg))
          }
        } else {
          var errMsg = parseHttpError(res)
          wx.showToast({ title: errMsg, icon: 'none' })
          reject(new Error(errMsg))
        }
      },
      fail: function (err) {
        var tip = networkTip()
        if (err && err.errMsg) tip = err.errMsg
        wx.showToast({ title: tip, icon: 'none', duration: 3000 })
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
          var msg = (body && body.msg) || parseHttpError(res) || '上传失败'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail: function (err) {
        var tip = networkTip()
        if (err && err.errMsg) tip = err.errMsg
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
    updateMe: function (d) { return request('/api/auth/me', 'POST', d) }
  },
  profile: {
    get: function () { return request('/api/v1/profile/') },
    update: function (d) { return request('/api/v1/profile/', 'POST', d) }
  },
  users: {
    list: function (params) { return request('/api/users/' + qs(params || {})) },
    detail: function (id) { return request('/api/users/' + id) },
    activityCircle: function () { return request('/api/v1/users/activity-circle') },
    uploadAvatar: function (filePath) {
      return uploadFile('/api/v1/users/me/avatar', filePath, 'file')
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
    reviewDelivery: function (taskId, deliveryId, action, reason) {
      var body = { action: action }
      if (reason) body.reason = reason
      return request(
        '/api/v1/tasks/' + taskId + '/deliveries/' + deliveryId + '/review',
        'POST',
        body
      )
    },
    appeal: function (taskId, reason) {
      return request('/api/v1/tasks/' + taskId + '/appeal', 'POST', { reason: reason || '' })
    }
  },
  activities: {
    list: function (params) { return request('/api/activities/' + qs(params || {})) },
    detail: function (id) { return request('/api/activities/' + id) },
    create: function (d) { return request('/api/activities/', 'POST', d) },
    signup: function (id) { return request('/api/activities/' + id + '/signup', 'POST') },
    mySignups: function () { return request('/api/activities/my/signups') },
    checkin: function (id) { return request('/api/v1/activities/' + id + '/checkin', 'POST') },
    attendees: function (id, params) {
      return request('/api/v1/activities/' + id + '/attendees' + qs(params || {}))
    },
    signin: function (activityId, userId) {
      return request('/api/v1/activities/' + activityId + '/signin/' + userId, 'POST')
    }
  },
  spaces: {
    list: function (params) { return request('/api/spaces/' + qs(params || {})) },
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
    quota: function () { return request('/api/v1/membership/quota/my') }
  },
  profit: {
    dashboard: function () { return request('/api/v1/profit/dashboard') },
    records: function (p) { return request('/api/v1/profit/records' + qs(p || {})) },
    referrals: function () { return request('/api/v1/profit/referrals') }
  },
  channel: {
    myLink: function () { return request('/api/v1/channel/my-link') },
    summary: function () { return request('/api/v1/channel/summary') }
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
