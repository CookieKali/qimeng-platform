var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var resolveAvatarUrl = apiModule.resolveAvatarUrl

function coverUrlFromUpload(data) {
  return (data && data.avatar_url) || ''
}

var TYPES = ['闭门沙龙', '行业论坛', '工作坊', '资源对接']

function defaultStart() {
  var d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  var date = d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2)
  var time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)
  return { date: date, time: time }
}

Page({
  data: {
    headerHeight: 64,
    statusBarHeight: 20,
    types: TYPES,
    form: {
      title: '',
      typeIdx: 0,
      startDate: '',
      startTime: '10:00',
      location: '',
      capacity: '20',
      desc: '',
      coverUrl: '',
      coverPreview: ''
    },
    coverUploading: false,
    submitting: false
  },

  onLoad: function () {
    var insets = layout.getPageInsets()
    var app = getApp()
    var start = defaultStart()
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      'form.startDate': start.date,
      'form.startTime': start.time
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

  onTypeChange: function (e) {
    this.setData({ 'form.typeIdx': parseInt(e.detail.value, 10) || 0 })
  },

  onStartDateChange: function (e) {
    this.setData({ 'form.startDate': e.detail.value })
  },

  onStartTimeChange: function (e) {
    this.setData({ 'form.startTime': e.detail.value })
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

  submitActivity: function () {
    var self = this
    if (self.data.submitting) return
    var form = self.data.form
    var types = self.data.types
    if (!form.title || !String(form.title).trim()) {
      wx.showToast({ title: '请填写活动标题', icon: 'none' })
      return
    }
    if (!form.location || !String(form.location).trim()) {
      wx.showToast({ title: '请填写地点', icon: 'none' })
      return
    }
    var typeLabel = types[form.typeIdx] || TYPES[0]
    var descBody = (form.desc || '').trim()
    var description = descBody ? '【' + typeLabel + '】' + descBody : '【' + typeLabel + '】'
    var startAt = form.startDate + 'T' + (form.startTime || '10:00') + ':00'
    self.setData({ submitting: true })
    var payload = {
      title: form.title.trim(),
      type: typeLabel,
      start_at: startAt,
      location: form.location.trim(),
      capacity: parseInt(form.capacity, 10) || 20,
      description: description
    }
    if (form.coverUrl) {
      payload.cover_url = form.coverUrl
    }
    api.activities.create(payload).then(function () {
      getApp().globalData.activityNeedRefresh = true
      wx.showToast({ title: '发布成功', icon: 'success', duration: 1500 })
      setTimeout(function () {
        wx.navigateBack()
      }, 1500)
    }).catch(function (err) {
      self.setData({ submitting: false })
      wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' })
    })
  }
})
