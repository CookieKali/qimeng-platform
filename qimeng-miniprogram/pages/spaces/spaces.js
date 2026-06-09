var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var api = apiModule.api
var SPACE_COLORS = [
  { accent: '#0c1e3a', stroke: '#1a4a8a', tc: '#5cb8ff' },
  { accent: '#1a1208', stroke: '#3a2810', tc: '#e8b040' },
  { accent: '#061e12', stroke: '#0f4030', tc: '#28e880' },
  { accent: '#1e1408', stroke: '#3a2810', tc: '#d8a030' },
  { accent: '#1e0e08', stroke: '#3a1a08', tc: '#ff8848' },
  { accent: '#061810', stroke: '#0e3820', tc: '#28e880' },
  { accent: '#1a0a14', stroke: '#3a1a28', tc: '#d880b0' }
]

var SPACE_TYPES = ['全部', '会议室', '路演厅', '联合办公', '沙龙空间', '餐饮包厢']

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateTime(iso) {
  if (!iso) return ''
  var raw = String(iso)
  var d = new Date(raw.indexOf('T') === -1 ? raw.replace(' ', 'T') : raw)
  if (isNaN(d.getTime())) return raw
  var y = d.getFullYear()
  var m = d.getMonth() + 1
  var day = d.getDate()
  var hh = pad2(d.getHours())
  var mm = pad2(d.getMinutes())
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day) + ' ' + hh + ':' + mm
}

function formatBookingStart(iso) {
  if (!iso) return ''
  var raw = String(iso)
  var d = new Date(raw.indexOf('T') === -1 ? raw.replace(' ', 'T') : raw)
  if (isNaN(d.getTime())) return raw
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

function getAuditStatusText(status) {
  var map = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已拒绝'
  }
  return map[status] || status
}

function getAuditStatusClass(status) {
  var map = {
    'pending': 'audit-pending',
    'approved': 'audit-approved',
    'rejected': 'audit-rejected'
  }
  return map[status] || ''
}

function enrichBookingItem(b) {
  var hours = b.hours != null ? b.hours : 0
  var hLabel = hours === Math.floor(hours) ? String(Math.floor(hours)) : String(hours)
  var status = b.status || 'past'
  return {
    id: b.id,
    space_id: b.space_id,
    space_name: b.space_name || '',
    start_time: b.start_time,
    end_time: b.end_time,
    hours: hours,
    status: status,
    audit_status: b.audit_status,
    audit_status_text: getAuditStatusText(b.audit_status),
    audit_status_class: getAuditStatusClass(b.audit_status),
    purpose: b.purpose || '',
    participant_count: b.participant_count || 1,
    note: b.note || '',
    reject_reason: b.reject_reason || '',
    amount: b.amount || 0,
    is_free_trial: b.is_free_trial || false,
    timeLabel: formatBookingStart(b.start_time) + ' 起，共' + hLabel + '小时',
    canCancel: status === 'upcoming' && b.audit_status !== 'rejected' && b.audit_status !== 'approved',
    canDismiss: b.audit_status === 'rejected',
    isCancelled: status === 'cancelled'
  }
}

function splitBookings(items) {
  var upcoming = []
  var past = []
  ;(items || []).forEach(function (b) {
    if (b.status === 'upcoming') upcoming.push(b)
    else past.push(b)
  })
  return { upcoming: upcoming, past: past }
}

function enrichSpace(s, idx) {
  var colors = SPACE_COLORS[idx % SPACE_COLORS.length]
  var facilities = s.facilities
  var feat = []
  if (Array.isArray(facilities)) {
    feat = facilities
  } else if (typeof facilities === 'string' && facilities) {
    try { feat = JSON.parse(facilities) } catch (e) { feat = [facilities] }
  }
  var pricePerHour = s.price_per_hour || 0
  var priceStr = pricePerHour > 0 ? pricePerHour + ' 积分/时' : '免费'
  return {
    id: s.id,
    station_id: s.station_id || 0,
    name: s.name || '',
    city: s.region || s.station_name || '',
    addr: s.address || '',
    cap: s.capacity ? s.capacity + '人' : '',
    area: '',
    type: s.type || '商务洽谈',
    feat: feat,
    open: s.available_hours || '',
    pricePerHour: pricePerHour,
    priceStr: priceStr,
    coverUrl: s.cover_url || s.image_url || '',
    accent: colors.accent,
    stroke: colors.stroke,
    tc: colors.tc
  }
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    cities: ['全部', '北京', '上海', '广州', '深圳', '成都'],
    spaceTypes: SPACE_TYPES,
    activeType: '全部',
    spaceKeyword: '',
    timeSlots: ['上午 09:00–12:00', '下午 13:00–17:00', '晚上 18:00–21:00', '全天'],
    purposes: ['客户洽谈', '团队会议', '项目路演', '私董会', '商务接待', '其他'],
    cityF: '全部',
    openFilter: null,
    displaySpaces: [],
    modal: null,
    selectedSpace: null,
    selectedSpaceIdx: 0,
    bookDate: '',
    bookTimeIdx: 0,
    bookNum: '4',
    bookPurposeIdx: 0,
    bookNote: '',
    estimatedCost: 0,
    estimatedHours: 3,
    bookTimeRange: '09:00 – 12:00',
    submitting: false,
    bookedSpaceIds: [],
    upcomingBookings: [],
    pastBookings: [],
    bookingsLoading: false,
    selectedBooking: null,
    mainSeg: 0,
    stations: [],
    filterStationId: 0,
    pendingSpaceId: 0
  },

  onLoad: function (options) {
    var today = new Date().toISOString().slice(0, 10)
    var patch = Object.assign({}, layout.getPageInsets(), { bookDate: today })
    if (options && options.stationId) {
      patch.filterStationId = parseInt(options.stationId, 10) || 0
      patch.mainSeg = 0
    }
    if (options && options.spaceId) {
      patch.pendingSpaceId = parseInt(options.spaceId, 10) || 0
      patch.mainSeg = 0
    }
    this.setData(patch)
  },

  onShow: function () {
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

  _buildListParams: function () {
    var params = {}
    if (this.data.cityF !== '全部') params.city = this.data.cityF
    if (this.data.activeType !== '全部') params.type = this.data.activeType
    if (this.data.spaceKeyword) params.keyword = this.data.spaceKeyword
    return params
  },

  switchMainSeg: function (e) {
    var n = parseInt(e.currentTarget.dataset.n, 10)
    if (n === this.data.mainSeg) return
    this.setData({ mainSeg: n })
    if (n === 0) this._loadSpaces()
    else this._loadStations()
  },

  _loadStations: function () {
    var self = this
    return api.spaces.stations().then(function (data) {
      self.setData({ stations: data.items || [] })
    }).catch(function () {
      self.setData({ stations: [] })
    })
  },

  openStationHub: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.navigateTo({ url: '/pages/station-hub/station-hub?id=' + id })
  },

  _applySpaceFilters: function (all) {
    var stationId = this.data.filterStationId
    if (stationId) {
      all = all.filter(function (s) { return Number(s.station_id) === stationId })
    }
    return all
  },

  _loadSpaces: function () {
    var self = this
    return api.spaces.list(this._buildListParams()).then(function (data) {
      var all = (data.items || []).map(function (s, i) { return enrichSpace(s, i) })
      all = self._applySpaceFilters(all)
      self.setData({ displaySpaces: all }, function () {
        self._tryOpenPendingSpace()
      })
    }).catch(function () {
      self.setData({ displaySpaces: [] })
    })
  },

  _tryOpenPendingSpace: function () {
    var spaceId = this.data.pendingSpaceId
    if (!spaceId) return
    var list = this.data.displaySpaces || []
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i].id) === spaceId) {
        this.setData({ pendingSpaceId: 0 })
        this.openDetail({ currentTarget: { dataset: { idx: i } } })
        break
      }
    }
  },

  _load: function () {
    if (this.data.mainSeg === 1) return this._loadStations()
    return this._loadSpaces()
  },

  onTypeChange: function (e) {
    var activeType = e.currentTarget.dataset.type
    if (!activeType || activeType === this.data.activeType) return
    this.setData({ activeType: activeType })
    this._loadSpaces()
  },

  onSpaceSearch: function (e) {
    var self = this
    if (this._searchTimer) clearTimeout(this._searchTimer)
    var value = e.detail.value
    this._searchTimer = setTimeout(function () {
      self.setData({ spaceKeyword: value }, function () {
        self._loadSpaces()
      })
    }, 300)
  },

  toggleFilter: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ openFilter: this.data.openFilter === key ? null : key })
  },

  setFilter: function (e) {
    var self = this
    var value = e.currentTarget.dataset.value
    this.setData({ cityF: value, openFilter: null }, function () {
      self._loadSpaces()
    })
  },

  openDetail: function (e) {
    var idx = e.currentTarget.dataset.idx
    var s = this.data.displaySpaces[idx]
    if (!s) return
    this.setData({
      modal: 'detail',
      selectedSpace: Object.assign({}, s, { featStr: (s.feat || []).join('、') }),
      selectedSpaceIdx: idx
    })
  },

  openBooking: function (e) {
    var self = this
    var idx = e.currentTarget.dataset.idx
    var s = this.data.displaySpaces[idx]
    if (!s) return
    var today = new Date().toISOString().slice(0, 10)
    this.setData({ 
      modal: 'booking', 
      selectedSpace: s, 
      selectedSpaceIdx: idx,
      bookDate: today,
      bookTimeIdx: 0,
      bookNum: '4',
      bookPurposeIdx: 0,
      bookNote: ''
    }, function () {
      self._calcCost()
    })
  },

  openBookingFromDetail: function () {
    var self = this
    var today = new Date().toISOString().slice(0, 10)
    this.setData({ 
      modal: 'booking',
      bookDate: today,
      bookTimeIdx: 0,
      bookNum: '4',
      bookPurposeIdx: 0,
      bookNote: ''
    }, function () {
      self._calcCost()
    })
  },

  onBookDate: function (e) { this.setData({ bookDate: e.detail.value }) },
  onBookTime: function (e) {
    var self = this
    this.setData({ bookTimeIdx: parseInt(e.detail.value, 10) || 0 }, function () {
      self._calcCost()
    })
  },
  onBookNum: function (e) { this.setData({ bookNum: e.detail.value }) },
  onBookPurpose: function (e) { this.setData({ bookPurposeIdx: e.detail.value }) },
  onBookNote: function (e) { this.setData({ bookNote: e.detail.value }) },

  _calcCost: function () {
    var s = this.data.selectedSpace
    var hoursMap = { 0: 3, 1: 4, 2: 3, 3: 8 }
    var timeRangeMap = { 0: '09:00 – 12:00', 1: '13:00 – 17:00', 2: '18:00 – 21:00', 3: '09:00 – 18:00' }
    var h = hoursMap[this.data.bookTimeIdx] || 3
    var price = s ? (s.pricePerHour || 0) : 0
    var cost = price * h
    this.setData({
      estimatedCost: cost,
      estimatedHours: h,
      bookTimeRange: timeRangeMap[this.data.bookTimeIdx] || ''
    })
  },

  submitBooking: function () {
    var self = this
    if (this.data.submitting) return   // 防止重复点击
    var selectedSpace = this.data.selectedSpace
    var bookDate = this.data.bookDate
    var bookTimeIdx = this.data.bookTimeIdx
    var bookNum = parseInt(this.data.bookNum, 10) || 1
    var purpose = this.data.purposes[this.data.bookPurposeIdx] || ''
    var note = this.data.bookNote || ''

    if (!selectedSpace || !selectedSpace.id) {
      wx.showToast({ title: '请选择空间', icon: 'none' }); return
    }
    if (!bookDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' }); return
    }
    var today = new Date().toISOString().slice(0, 10)
    if (bookDate < today) {
      wx.showToast({ title: '预约日期不能是过去', icon: 'none' }); return
    }
    if (bookNum < 1) {
      wx.showToast({ title: '请输入参与人数', icon: 'none' }); return
    }

    var timeMap  = { 0: '09:00:00', 1: '13:00:00', 2: '18:00:00', 3: '09:00:00' }
    var hoursMap = { 0: 3, 1: 4, 2: 3, 3: 8 }
    var startTime = bookDate + 'T' + timeMap[bookTimeIdx]

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    api.spaces.book({
      space_id: selectedSpace.id,
      start_time: startTime,
      hours: hoursMap[bookTimeIdx],
      purpose: purpose,
      participant_count: bookNum,
      note: note
    }).then(function () {
      wx.hideLoading()
      self.setData({ modal: null, submitting: false })
      wx.showToast({ title: '预约已提交，请等待审核', icon: 'success' })
      self._loadMyBookings()
    }).catch(function () {
      wx.hideLoading()
      self.setData({ submitting: false })
      // api.js 已经弹过 Toast，这里只重置状态
    })
  },

  _loadMyBookings: function () {
    var self = this
    this.setData({ bookingsLoading: true })
    return api.spaces.myBookings().then(function (data) {
      var items = (data.items || []).map(enrichBookingItem)
      var groups = splitBookings(items)
      self.setData({
        upcomingBookings: groups.upcoming,
        pastBookings: groups.past,
        bookingsLoading: false
      })
    }).catch(function (err) {
      self.setData({ bookingsLoading: false, upcomingBookings: [], pastBookings: [] })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  openMyBookings: function () {
    var self = this
    this.setData({ modal: 'mybookings' })
    this._loadMyBookings()
  },

  openBookingDetail: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    var bookings = [].concat(this.data.upcomingBookings, this.data.pastBookings)
    var booking = bookings.find(function (b) { return b.id === id })
    if (booking) {
      this.setData({ modal: 'bookingDetail', selectedBooking: booking })
    }
  },

  confirmCancelBooking: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '取消预约',
      content: '确定要取消该预约吗？',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '取消中...' })
        api.spaces.cancelBooking(id).then(function () {
          wx.hideLoading()
          wx.showToast({ title: '已取消', icon: 'success' })
          self._loadMyBookings()
        }).catch(function (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
        })
      }
    })
  },

  dismissBooking: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showLoading({ title: '处理中...' })
    api.spaces.cancelBooking(id).then(function () {
      wx.hideLoading()
      wx.showToast({ title: '已清除', icon: 'success' })
      self._loadMyBookings()
    }).catch(function () {
      wx.hideLoading()
      self._loadMyBookings()
    })
  },

  closeModal: function () {
    this.setData({
      modal: null,
      upcomingBookings: [],
      pastBookings: [],
      bookingsLoading: false,
      selectedBooking: null
    })
  },
  stopProp: function () {}
})
