var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var resolveAvatarUrl = apiModule.resolveAvatarUrl

function coverUrlFromUpload(data) {
  return (data && data.avatar_url) || ''
}

Page({
  data: {
    headerHeight: 64,
    statusBarHeight: 20,
    balance: 0,
    cats: ['活动策划', '内容创作', '设计', '资源对接', '推广', '咨询', '其他'],
    lvOptions: ['B', 'A', 'S', 'SS'],
    form: {
      title: '',
      desc: '',
      catIdx: 0,
      credits: '',
      quota: '1',
      minLvIdx: 0,
      deadline: '',
      coverUrl: '',
      coverPreview: ''
    },
    coverUploading: false,
    submitting: false
  },

  onLoad: function () {
    var insets = layout.getPageInsets()
    var app = getApp()
    var user = app.globalData.user || {}
    var today = new Date()
    var deadline = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      balance: user.credit_balance || 0,
      'form.deadline': deadline
    })
  },

  onCancel: function () {
    wx.navigateBack()
  },

  onField: function (e) {
    var key = e.currentTarget.dataset.key
    var update = {}
    update['form.' + key] = e.detail.value
    this.setData(update)
  },

  onCatChange: function (e) {
    this.setData({ 'form.catIdx': parseInt(e.detail.value, 10) || 0 })
  },

  onMinLvChange: function (e) {
    this.setData({ 'form.minLvIdx': parseInt(e.detail.value, 10) || 0 })
  },

  onDeadlineChange: function (e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  chooseCover: function () {
    var self = this
    if (self.data.coverUploading || self.data.submitting) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        var path = file.tempFilePath
        self.setData({
          coverUploading: true,
          'form.coverPreview': path
        })
        api.users.uploadAvatar(path).then(function (data) {
          var url = coverUrlFromUpload(data)
          self.setData({
            coverUploading: false,
            'form.coverUrl': url,
            'form.coverPreview': resolveAvatarUrl(url) || path
          })
        }).catch(function () {
          self.setData({ coverUploading: false })
        })
      }
    })
  },

  removeCover: function () {
    this.setData({
      'form.coverUrl': '',
      'form.coverPreview': ''
    })
  },

  submitTask: function () {
    var self = this
    if (self.data.submitting) return
    var form = self.data.form
    var cats = self.data.cats
    var lvOptions = self.data.lvOptions
    if (!form.title || !String(form.title).trim()) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    var credits = parseInt(form.credits, 10) || 0
    if (credits <= 0) {
      wx.showToast({ title: '请填写积分', icon: 'none' })
      return
    }
    var quota = parseInt(form.quota, 10) || 1
    var totalNeeded = credits * quota
    if (totalNeeded > self.data.balance) {
      wx.showToast({
        title: '积分不足，需' + totalNeeded + '，余额' + self.data.balance,
        icon: 'none'
      })
      return
    }
    self.setData({ submitting: true })
    api.tasks.create({
      title: form.title.trim(),
      category: cats[form.catIdx] || '其他',
      description: form.desc || '暂无描述',
      base_credit_per_person: credits,
      total_quota: parseInt(form.quota, 10) || 1,
      min_reputation_level: lvOptions[form.minLvIdx] || 'B',
      deliver_deadline: form.deadline || null
    }).then(function () {
      self.setData({ submitting: false })
      var app = getApp()
      app.globalData.taskNeedRefresh = true
      app.globalData.taskSubTarget = 2
      wx.showToast({ title: '发布成功', icon: 'success', duration: 1500 })
      wx.switchTab({ url: '/pages/tasks/tasks' })
    }).catch(function (err) {
      self.setData({ submitting: false })
      wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' })
    })
  }
})
