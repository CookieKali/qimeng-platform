var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var api = apiModule.api

var STATUS_MAP = {
  pending: '待确认',
  confirmed: '已确认',
  paid: '已发放'
}

function fenToYuan(fen) {
  var n = Number(fen) || 0
  return (n / 100).toFixed(2)
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    loading: false,
    dash: {
      monthTotalYuan: '0.00',
      totalYuan: '0.00',
      pendingYuan: '0.00',
      paidYuan: '0.00',
      refereeCount: 0,
      period: ''
    },
    quota: {
      totalYuan: '0.00',
      usedYuan: '0.00',
      remainingYuan: '0.00'
    },
    recordList: [],
    referralList: [],
    myLink: '',
    channelSummary: {
      referee_count: 0,
      register_contrib: 0,
      paid_contrib: 0,
      member_fee_profit_yuan: '0.00'
    }
  },

  onLoad: function () {
    this.setData(layout.getPageInsets())
  },

  onShow: function () {
    tabUtil.setTab(this, 2)
    this._load()
  },

  _load: function () {
    var self = this
    this.setData({ loading: true })
    Promise.all([
      api.profit.dashboard(),
      api.profit.records({ page: 1, page_size: 30 }),
      api.profit.referrals(),
      api.membership.quota(),
      api.channel.myLink(),
      api.channel.summary()
    ]).then(function (results) {
      var dash = results[0] || {}
      var records = results[1] || {}
      var referrals = results[2] || {}
      var quota = results[3] || {}
      var linkData = results[4] || {}
      var channelSum = results[5] || {}

      var recordList = (records.items || []).map(function (r) {
        return {
          id: r.id,
          period: r.period || '',
          source: r.source || '',
          amountYuan: fenToYuan(r.amount),
          status: r.status || '',
          statusLabel: STATUS_MAP[r.status] || r.status || '',
          note: r.note || '',
          date: r.created_at ? String(r.created_at).slice(0, 10) : ''
        }
      })

      var referralList = (referrals.items || []).map(function (r) {
        return {
          user_id: r.user_id,
          name: r.name || '',
          relation: r.relation || '',
          second_level_count: r.second_level_count || 0
        }
      })

      self.setData({
        dash: {
          monthTotalYuan: fenToYuan(dash.month_total),
          totalYuan: fenToYuan(dash.total),
          pendingYuan: fenToYuan(dash.pending),
          paidYuan: fenToYuan(dash.paid),
          refereeCount: dash.referee_count || 0,
          period: dash.period || ''
        },
        quota: {
          totalYuan: fenToYuan(quota.total),
          usedYuan: fenToYuan(quota.used),
          remainingYuan: fenToYuan(quota.remaining)
        },
        recordList: recordList,
        referralList: referralList,
        myLink: linkData.link || '',
        channelSummary: {
          referee_count: channelSum.referee_count || 0,
          register_contrib: channelSum.register_contrib || 0,
          paid_contrib: channelSum.paid_contrib || 0,
          member_fee_profit_yuan: fenToYuan(channelSum.member_fee_profit)
        }
      })
    }).catch(function () {
      /* request() 已 toast，不 setData 避免假成功 */
    }).finally(function () {
      self.setData({ loading: false })
    })
  },

  copyLink: function () {
    var link = this.data.myLink
    if (!link) {
      wx.showToast({ title: '暂无引荐链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' })
      },
      fail: function () {
        wx.showToast({ title: '复制失败', icon: 'none' })
      }
    })
  }
})
