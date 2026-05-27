var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api

var SCENES = {
  traffic_boost: { label: '流量扶持', cost: 500, needTarget: true },
  credit_accel: { label: '信用加速', cost: 200, needTarget: false },
  perk: { label: '权益兑换', cost: 1000, needTarget: false }
}

function fmtTime(dt) {
  if (!dt) return ''
  return String(dt).replace('T', ' ').slice(0, 16)
}

function buildSuccessMsg(scene, data) {
  var cfg = SCENES[scene] || { label: scene }
  var effect = data.effect || {}
  var extra = ''
  if (scene === 'traffic_boost' && effect.recommendation_id) {
    extra = '，推荐位#' + effect.recommendation_id
  } else if (scene === 'credit_accel' && effect.delta) {
    extra = '，信用+' + effect.delta
  } else if (scene === 'perk') {
    extra = '，权益已兑换'
  }
  return cfg.label + '成功，扣' + data.cost + '分，余额' + data.balance_after + extra
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 24,
    balance: 0,
    logs: [],
    myPostedTasks: [],
    boostTaskIdx: 0,
    boostTargetId: 0,
    loading: true,
    loadError: '',
    consuming: false
  },

  onLoad: function () {
    var insets = layout.getPageInsets()
    var app = getApp()
    var safeBottom = (app.globalData && app.globalData.safeBottom) || 0
    this.setData({
      headerHeight: insets.headerHeight,
      pageBottom: safeBottom + 20
    })
  },

  onShow: function () {
    this._load()
  },

  _load: function () {
    var self = this
    this.setData({ loading: true, loadError: '' })

    Promise.all([
      api.contribution.balance(),
      api.contribution.list(),
      api.tasks.my().catch(function () { return { posted: [] } })
    ]).then(function (results) {
      var balData = results[0] || {}
      var listData = results[1] || {}
      var myTasksData = results[2] || {}
      var items = listData.items || []
      var posted = (myTasksData.posted || []).filter(function (t) {
        return t.status !== 'completed'
      })
      var logs = items.map(function (row) {
        var amt = row.amount || 0
        return {
          id: row.id,
          source: row.source || '',
          amount: amt,
          amountText: (amt > 0 ? '+' : '') + amt,
          amountColor: amt > 0 ? '#28e880' : '#ff8888',
          balance: row.balance,
          note: row.note || '',
          time: fmtTime(row.created_at)
        }
      })
      self.setData({
        balance: balData.contribution_balance != null ? balData.contribution_balance : (listData.balance || 0),
        logs: logs,
        myPostedTasks: posted,
        boostTaskIdx: 0,
        boostTargetId: posted.length ? posted[0].id : 0,
        loading: false,
        loadError: ''
      })
    }).catch(function (err) {
      self.setData({
        loading: false,
        loadError: (err && err.message) || '加载失败'
      })
    })
  },

  goBack: function () {
    wx.navigateBack({ delta: 1 })
  },

  onBoostTaskChange: function (e) {
    var idx = parseInt(e.detail.value, 10) || 0
    var task = this.data.myPostedTasks[idx]
    this.setData({
      boostTaskIdx: idx,
      boostTargetId: task ? task.id : 0
    })
  },

  stopProp: function () {},

  onConsume: function (e) {
    var self = this
    var scene = e.currentTarget.dataset.scene
    var cfg = SCENES[scene]
    if (!cfg || self.data.consuming) return

    if (scene === 'traffic_boost' && (!self.data.boostTargetId || self.data.boostTargetId <= 0)) {
      wx.showToast({ title: '请先选择要推广的任务', icon: 'none' })
      return
    }

    if (self.data.balance < cfg.cost) {
      wx.showToast({ title: '贡献积分不足', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认兑换',
      content: cfg.label + ' 消耗 ' + cfg.cost + ' 贡献积分',
      success: function (res) {
        if (!res.confirm) return
        self.setData({ consuming: true })
        var tType = cfg.needTarget ? 'task' : undefined
        var tId = cfg.needTarget ? self.data.boostTargetId : undefined
        api.contribution.consume(scene, tType, tId).then(function (data) {
          self.setData({ consuming: false })
          wx.showToast({
            title: buildSuccessMsg(scene, data),
            icon: 'none',
            duration: 2800
          })
          self._load()
        }).catch(function (err) {
          self.setData({ consuming: false })
          var msg = (err && err.message) || '兑换失败'
          wx.showToast({ title: msg, icon: 'none', duration: 2500 })
        })
      }
    })
  }
})
