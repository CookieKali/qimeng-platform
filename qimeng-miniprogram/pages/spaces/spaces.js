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

function formatBookingStart(iso) {
  if (!iso) return ''
  var raw = String(iso)
  var d = new Date(raw.indexOf('T') === -1 ? raw.replace(' ', 'T') : raw)
  if (isNaN(d.getTime())) return raw
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
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
    hours: hours,
    status: status,
    timeLabel: formatBookingStart(b.start_time) + ' 起，共' + hLabel + '小时',
    canCancel: status === 'upcoming',
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
  return {
    id: s.id,
    name: s.name || '',
    city: s.region || s.station_name || '',
    addr: s.address || '',
    cap: s.capacity ? s.capacity + '人' : '',
    area: '',
    type: s.type || '商务洽谈',
    feat: feat,
    open: s.available_hours || '',
    pricePerHour: s.price_per_hour || 0,
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
    purposes: ['客户洽谈', '团队会议', '项目路演', '私董会', '商务接待'],
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
    upcomingBookings: [],
    pastBookings: [],
    bookingsLoading: false
  },

  onLoad: function () {
    var today = new Date().toISOString().slice(0, 10)
    this.setData(Object.assign({}, layout.getPageInsets(), { bookDate: today }))
  },

  onShow: function () {
    tabUtil.setTab(this, 3)
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

  _load: function () {
    var self = this
    return api.spaces.list(this._buildListParams()).then(function (data) {
      var all = (data.items || []).map(function (s, i) { return enrichSpace(s, i) })
      self.setData({ displaySpaces: all })
    }).catch(function () {
      self.setData({ displaySpaces: [] })
    })
  },

  onTypeChange: function (e) {
    var activeType = e.currentTarget.dataset.type
    if (!activeType || activeType === this.data.activeType) return
    this.setData({ activeType: activeType })
    this._load()
  },

  onSpaceSearch: function (e) {
    var self = this
    if (this._searchTimer) clearTimeout(this._searchTimer)
    var value = e.detail.value
    this._searchTimer = setTimeout(function () {
      self.setData({ spaceKeyword: value }, function () {
        self._load()
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
      self._load()
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
    this.setData({ modal: 'booking', selectedSpace: s, selectedSpaceIdx: idx }, function () {
      self._calcCost()
    })
  },

  openBookingFromDetail: function () {
    var self = this
    this.setData({ modal: 'booking' }, function () {
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
    var h = hoursMap[this.data.bookTimeIdx] || 3
    var price = s ? (s.pricePerHour || 0) : 0
    var cost = price * h
    this.setData({ estimatedCost: cost, estimatedHours: h })
  },

  submitBooking: function () {
    var self = this
    var selectedSpace = this.data.selectedSpace
    var bookDate = this.data.bookDate
    var bookTimeIdx = this.data.bookTimeIdx
    if (!selectedSpace || !selectedSpace.id) {
      wx.showToast({ title: '请选择空间', icon: 'none' })
      return
    }
    var timeMap = { 0: '09:00:00', 1: '13:00:00', 2: '18:00:00', 3: '09:00:00' }
    var hoursMap = { 0: 3, 1: 4, 2: 3, 3: 8 }
    var startTime = bookDate + 'T' + timeMap[bookTimeIdx]
    api.spaces.book({
      space_id: selectedSpace.id,
      start_time: startTime,
      hours: hoursMap[bookTimeIdx]
    }).then(function () {
      self.setData({ modal: null })
      wx.showToast({ title: '预约已提交', icon: 'success' })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '预约失败，请重试', icon: 'none' })
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

  confirmCancelBooking: function (e) {
    var self = this
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.showModal({
      title: '取消预约',
      content: '确定要取消该预约吗？',
      success: function (res) {
        if (!res.confirm) return
        api.spaces.cancelBooking(id).then(function () {
          wx.showToast({ title: '已取消', icon: 'success' })
          self._loadMyBookings()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
        })
      }
    })
  },

  closeModal: function () {
    this.setData({
      modal: null,
      upcomingBookings: [],
      pastBookings: [],
      bookingsLoading: false
    })
  },
  stopProp: function () {}
})
