var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var api = apiModule.api
var resolveAvatarUrl = apiModule.resolveAvatarUrl

function coverUrlFromUpload(data) {
  return (data && (data.cover_url || data.avatar_url)) || ''
}

var TYPES = ['闭门沙龙', '行业论坛', '工作坊', '资源对接']

function typeIndex(types, label) {
  var idx = types.indexOf(label)
  return idx >= 0 ? idx : 0
}

function parseActivityType(description) {
  var d = description || ''
  var m = /^【([^】]+)】/.exec(d)
  if (m) {
    return { type: m[1], desc: d.slice(m[0].length).trim() }
  }
  return { type: TYPES[0], desc: d }
}

function defaultStart() {
  var d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  var date = d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2)
  var time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)
  return { date: date, time: time }
}

function splitDateTime(iso) {
  if (!iso) return { date: '', time: '10:00' }
  var s = String(iso)
  var date = s.slice(0, 10)
  var time = s.length >= 16 ? s.slice(11, 16) : '10:00'
  return { date: date, time: time }
}

Page({
  data: {
    headerHeight: 64,
    statusBarHeight: 20,
    editActivityId: 0,
    isEditMode: false,
    types: TYPES,
    form: {
      title: '',
      typeIdx: 0,
      startDate: '',
      startTime: '10:00',
      endDate: '',
      endTime: '12:00',
      location: '',
      capacity: '20',
      desc: '',
      coverUrl: '',
      coverPreview: ''
    },
    coverUploading: false,
    submitting: false,
    formErrors: {},
    showSuccessModal: false,
    createdActivity: null
  },

  onLoad: function (options) {
    var insets = layout.getPageInsets()
    var app = getApp()
    var start = defaultStart()
    var endDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    var endDateStr = endDate.getFullYear() + '-' +
      ('0' + (endDate.getMonth() + 1)).slice(-2) + '-' +
      ('0' + endDate.getDate()).slice(-2)
    var editId = options && options.id ? parseInt(options.id, 10) : 0
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      editActivityId: editId || 0,
      isEditMode: !!editId,
      'form.startDate': start.date,
      'form.startTime': start.time,
      'form.endDate': endDateStr
    })
    if (editId) {
      this._loadActivityForEdit(editId)
    }
  },

  _loadActivityForEdit: function (activityId) {
    var self = this
    wx.showLoading({ title: '加载中...' })
    api.activities.detail(activityId).then(function (a) {
      wx.hideLoading()
      if (!a || !a.id) {
        wx.showToast({ title: '活动不存在', icon: 'none' })
        return
      }
      var parsed = parseActivityType(a.description)
      var start = splitDateTime(a.start_at)
      var end = splitDateTime(a.end_at)
      var coverUrl = a.cover_url || ''
      self.setData({
        form: {
          title: a.title || '',
          typeIdx: typeIndex(TYPES, parsed.type),
          startDate: start.date,
          startTime: start.time,
          endDate: end.date,
          endTime: end.time || '12:00',
          location: a.location || '',
          capacity: String(a.capacity || 20),
          desc: parsed.desc,
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
    var errors = this.data.formErrors
    if (errors[key]) {
      delete errors[key]
      this.setData({ formErrors: errors })
    }
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

  onEndDateChange: function (e) {
    this.setData({ 'form.endDate': e.detail.value })
  },

  onEndTimeChange: function (e) {
    this.setData({ 'form.endTime': e.detail.value })
  },

  validateForm: function () {
    var form = this.data.form
    var errors = {}
    var isValid = true

    if (!form.title || !String(form.title).trim()) {
      errors.title = '请填写活动标题'
      isValid = false
    } else if (form.title.trim().length < 2) {
      errors.title = '活动标题至少2个字符'
      isValid = false
    } else if (form.title.trim().length > 128) {
      errors.title = '活动标题不能超过128个字符'
      isValid = false
    }

    if (!form.location || !String(form.location).trim()) {
      errors.location = '请填写活动地点'
      isValid = false
    }

    if (!form.startDate) {
      errors.startDate = '请选择开始时间'
      isValid = false
    }

    if (!form.capacity) {
      errors.capacity = '请填写活动人数'
      isValid = false
    } else {
      var capacity = parseInt(form.capacity, 10)
      if (isNaN(capacity) || capacity < 1 || capacity > 1000) {
        errors.capacity = '活动人数需在1-1000之间'
        isValid = false
      }
    }

    if (form.startDate && form.endDate) {
      var startDateTime = new Date(form.startDate + 'T' + (form.startTime || '00:00'))
      var endDateTime = new Date(form.endDate + 'T' + (form.endTime || '23:59'))
      if (form.endDate && endDateTime <= startDateTime) {
        errors.endDate = '结束时间需晚于开始时间'
        isValid = false
      }
    }

    this.setData({ formErrors: errors })
    return isValid
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
        api.activities.uploadCover(path).then(function (data) {
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

  _buildEditPayload: function (coverUrl) {
    var form = this.data.form
    var types = this.data.types
    var typeLabel = types[form.typeIdx] || TYPES[0]
    var descBody = (form.desc || '').trim()
    var description = descBody ? '【' + typeLabel + '】' + descBody : '【' + typeLabel + '】'
    var payload = {
      title: form.title.trim(),
      description: description,
      location: form.location.trim(),
      cover_url: coverUrl || ''
    }
    if (form.endDate) {
      payload.end_at = form.endDate + 'T' + (form.endTime || '12:00') + ':00'
    }
    return payload
  },

  _buildPayload: function (coverUrl) {
    var form = this.data.form
    var types = this.data.types
    var typeLabel = types[form.typeIdx] || TYPES[0]
    var descBody = (form.desc || '').trim()
    var description = descBody ? '【' + typeLabel + '】' + descBody : '【' + typeLabel + '】'
    var startAt = form.startDate + 'T' + (form.startTime || '10:00') + ':00'
    var payload = {
      title: form.title.trim(),
      description: description,
      start_at: startAt,
      location: form.location.trim(),
      capacity: parseInt(form.capacity, 10) || 20,
      cover_url: coverUrl || ''
    }
    if (form.endDate) {
      payload.end_at = form.endDate + 'T' + (form.endTime || '12:00') + ':00'
    }
    return payload
  },

  submitActivity: function () {
    var self = this
    if (self.data.submitting) return
    if (self.data.coverUploading) {
      wx.showToast({ title: '封面上传中，请稍候', icon: 'none' })
      return
    }
    if (!self.validateForm()) return
    if (self.data.isEditMode) {
      this._submitEdit()
      return
    }
    this._submitCreate()
  },

  _submitEdit: function () {
    var self = this
    var form = self.data.form

    var doUpdate = function (coverUrl) {
      self.setData({ submitting: true })
      api.activities.update(self.data.editActivityId, self._buildEditPayload(coverUrl)).then(function () {
        self.setData({ submitting: false })
        getApp().globalData.activityNeedRefresh = true
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 800)
      }).catch(function (err) {
        self.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
    }

    if (form.coverPreview && !form.coverUrl) {
      self.setData({ submitting: true, coverUploading: true })
      api.activities.uploadCover(form.coverPreview).then(function (data) {
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

    var doCreate = function (coverUrl) {
      self.setData({ submitting: true })
      api.activities.create(self._buildPayload(coverUrl)).then(function (result) {
        getApp().globalData.activityNeedRefresh = true
        self.setData({
          submitting: false,
          showSuccessModal: true,
          createdActivity: result
        })
      }).catch(function (err) {
        self.setData({ submitting: false })
        var errorMsg = (err && err.message) || '发布失败'
        if (err && err.detail) {
          if (typeof err.detail === 'string') {
            errorMsg = err.detail
          } else if (Array.isArray(err.detail)) {
            errorMsg = err.detail.join('；')
          }
        }
        wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 })
      })
    }

    if (form.coverPreview && !form.coverUrl) {
      self.setData({ submitting: true, coverUploading: true })
      api.activities.uploadCover(form.coverPreview).then(function (data) {
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
  },

  stopProp: function () {},

  onSuccessConfirm: function () {
    this.setData({ showSuccessModal: false })
    getApp().globalData.activityNeedRefresh = true
    wx.navigateBack()
  },

  onSuccessViewActivity: function () {
    var app = getApp()
    var created = this.data.createdActivity || {}
    var actId = created.id || (created.data && created.data.id)
    this.setData({ showSuccessModal: false })
    app.globalData.activityNeedRefresh = true
    app.globalData.tasksMainSub = 1
    if (actId) {
      wx.setStorageSync('qm_open_activity_id', actId)
    }
    wx.switchTab({ url: '/pages/tasks/tasks' })
  }
})
