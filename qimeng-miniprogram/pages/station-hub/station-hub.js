var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api

function fenToWanYuan(val) {
  var n = Number(val) || 0
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  return String(Math.round(n))
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 24,
    stationId: 0,
    loading: true,
    hub: null
  },

  onLoad: function (options) {
    var insets = layout.getPageInsets()
    var id = options && options.id ? parseInt(options.id, 10) : 0
    this.setData({
      headerHeight: insets.headerHeight,
      pageBottom: insets.pageBottom || 24,
      stationId: id
    })
    if (id) this._load(id)
    else {
      this.setData({ loading: false })
      wx.showToast({ title: '空间站不存在', icon: 'none' })
    }
  },

  onPullDownRefresh: function () {
    var self = this
    if (!this.data.stationId) {
      wx.stopPullDownRefresh()
      return
    }
    this._load(this.data.stationId).finally(function () {
      wx.stopPullDownRefresh()
    })
  },

  _load: function (id) {
    var self = this
    this.setData({ loading: true })
    return api.spaces.stationDetail(id).then(function (data) {
      if (!data) {
        self.setData({ loading: false, hub: null })
        return
      }
      var shareholders = (data.shareholders || []).map(function (sh) {
        return {
          user_id: sh.user_id,
          name: sh.name || '',
          industry: sh.industry || '',
          shares: sh.shares || 0,
          investWan: fenToWanYuan(sh.invest_amount)
        }
      })
      var settlements = (data.settlements || []).map(function (s) {
        return {
          period: s.period || '',
          revenueWan: fenToWanYuan(s.revenue),
          netWan: fenToWanYuan(s.net),
          distributedWan: fenToWanYuan(s.distributed)
        }
      })
      self.setData({
        loading: false,
        hub: {
          id: data.id,
          name: data.name || '',
          region: data.region || '',
          address: data.address || '',
          description: data.description || '',
          operatorName: data.operator_name || '',
          coverUrl: data.cover_url || data.image_url || '',
          memberCount: data.member_count || 0,
          shareholderCount: data.shareholder_count || 0,
          annualRevenueWan: fenToWanYuan(data.annual_revenue),
          spaceCount: data.space_count || (data.spaces || []).length,
          shareholders: shareholders,
          spaces: data.spaces || [],
          settlements: settlements
        }
      })
    }).catch(function () {
      self.setData({ loading: false, hub: null })
    })
  },

  goBookSpace: function () {
    var hub = this.data.hub
    if (!hub || !hub.id) return
    wx.navigateTo({ url: '/pages/spaces/spaces?stationId=' + hub.id })
  },

  openSpace: function (e) {
    var spaceId = parseInt(e.currentTarget.dataset.id, 10)
    if (!spaceId) return
    wx.navigateTo({ url: '/pages/spaces/spaces?spaceId=' + spaceId })
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  }
})
