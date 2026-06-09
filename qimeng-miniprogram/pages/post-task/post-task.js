var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var resolveAvatarUrl = apiModule.resolveAvatarUrl

function coverUrlFromUpload(data) {
  return (data && (data.cover_url || data.avatar_url)) || ''
}

function catIndex(cats, name) {
  var idx = cats.indexOf(name)
  return idx >= 0 ? idx : cats.length - 1
}

function lvIndex(lvOptions, lv) {
  var idx = lvOptions.indexOf(lv)
  return idx >= 0 ? idx : 0
}

Page({
  data: {
    headerHeight: 64,
    statusBarHeight: 20,
    balance: 0,
    editTaskId: 0,
    isEditMode: false,
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

  onLoad: function (options) {
    var self = this
    var insets = layout.getPageInsets()
    var app = getApp()
    var user = app.globalData.user || {}
    var today = new Date()
    var deadline = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    var editId = options && options.id ? parseInt(options.id, 10) : 0
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      balance: user.credit_balance || 0,
      editTaskId: editId || 0,
      isEditMode: !!editId,
      'form.deadline': deadline
    })
    api.credit.balance().then(function (data) {
      var bal = (data && (data.balance != null ? data.balance : data.credit_balance)) || 0
      self.setData({ balance: bal })
    }).catch(function () {})
    if (editId) {
      this._loadTaskForEdit(editId)
    }
  },

  _loadTaskForEdit: function (taskId) {
    var self = this
    wx.showLoading({ title: '加载中...' })
    api.tasks.detail(taskId).then(function (t) {
      wx.hideLoading()
      if (!t || !t.id) {
        wx.showToast({ title: '任务不存在', icon: 'none' })
        return
      }
      var cats = self.data.cats
      var lvOptions = self.data.lvOptions
      var coverUrl = t.cover_url || ''
      self.setData({
        form: {
          title: t.title || '',
          desc: t.description || '',
          catIdx: catIndex(cats, t.category || '其他'),
          credits: String(t.base_credit_per_person || 0),
          quota: String(t.total_quota || 1),
          minLvIdx: lvIndex(lvOptions, t.min_reputation_level || 'B'),
          deadline: t.deliver_deadline ? String(t.deliver_deadline).slice(0, 10) : '',
          coverUrl: coverUrl,
          coverPreview: coverUrl ? resolveAvatarUrl(coverUrl) : ''
        }
      })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
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
      sizeType: ['compressed'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        var path = file.tempFilePath
        self.setData({
          coverUploading: true,
          'form.coverPreview': path
        })
        api.tasks.uploadCover(path).then(function (data) {
          var url = coverUrlFromUpload(data)
          self.setData({
            coverUploading: false,
            'form.coverUrl': url,
            'form.coverPreview': path
          })
        }).catch(function (err) {
          self.setData({
            coverUploading: false,
            'form.coverPreview': '',
            'form.coverUrl': ''
          })
          wx.showToast({ title: (err && err.message) || '封面上传失败', icon: 'none' })
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
    if (self.data.coverUploading) {
      wx.showToast({ title: '封面上传中，请稍候', icon: 'none' })
      return
    }
    if (self.data.isEditMode) {
      this._submitEdit()
      return
    }
    this._submitCreate()
  },

  _submitEdit: function () {
    var self = this
    var form = self.data.form
    var cats = self.data.cats
    var lvOptions = self.data.lvOptions
    if (!form.title || !String(form.title).trim()) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }

    var doUpdate = function (coverUrl) {
      self.setData({ submitting: true })
      var payload = {
        title: form.title.trim(),
        category: cats[form.catIdx] || '其他',
        description: form.desc || '暂无描述',
        min_reputation_level: lvOptions[form.minLvIdx] || 'B',
        deliver_deadline: form.deadline || null,
        cover_url: coverUrl || ''
      }
      api.tasks.update(self.data.editTaskId, payload).then(function () {
        self.setData({ submitting: false })
        getApp().globalData.taskNeedRefresh = true
        getApp().globalData.taskSubTarget = 2
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 800)
      }).catch(function (err) {
        self.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
    }

    if (form.coverPreview && !form.coverUrl) {
      self.setData({ submitting: true, coverUploading: true })
      api.tasks.uploadCover(form.coverPreview).then(function (data) {
        var url = coverUrlFromUpload(data)
        self.setData({ coverUploading: false, 'form.coverUrl': url })
        doUpdate(url)
      }).catch(function (err) {
        self.setData({ submitting: false, coverUploading: false })
        wx.showToast({ title: (err && err.message) || '封面上传失败', icon: 'none' })
      })
      return
    }
    doUpdate(form.coverUrl)
  },

  _submitCreate: function () {
    var self = this
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

    var doCreate = function (coverUrl) {
      self.setData({ submitting: true })
      var payload = {
        title: form.title.trim(),
        category: cats[form.catIdx] || '其他',
        description: form.desc || '暂无描述',
        base_credit_per_person: credits,
        total_quota: parseInt(form.quota, 10) || 1,
        min_reputation_level: lvOptions[form.minLvIdx] || 'B',
        deliver_deadline: form.deadline || null
      }
      if (coverUrl) {
        payload.cover_url = coverUrl
      }
      api.tasks.create(payload).then(function () {
        self.setData({ submitting: false })
        var app = getApp()
        api.credit.balance().then(function (d) {
          var bal = (d && (d.balance != null ? d.balance : d.credit_balance)) || 0
          if (app.globalData.user) app.globalData.user.credit_balance = bal
        }).catch(function () {})
        app.globalData.taskNeedRefresh = true
        app.globalData.taskSubTarget = 2
        wx.showToast({ title: '发布成功', icon: 'success', duration: 1500 })
        wx.switchTab({ url: '/pages/tasks/tasks' })
      }).catch(function (err) {
        self.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' })
      })
    }

    if (form.coverPreview && !form.coverUrl) {
      self.setData({ submitting: true, coverUploading: true })
      api.tasks.uploadCover(form.coverPreview).then(function (data) {
        var url = coverUrlFromUpload(data)
        self.setData({ coverUploading: false, 'form.coverUrl': url })
        doCreate(url)
      }).catch(function (err) {
        self.setData({ submitting: false, coverUploading: false })
        wx.showToast({ title: (err && err.message) || '封面上传失败', icon: 'none' })
      })
      return
    }
    doCreate(form.coverUrl)
  }
})
