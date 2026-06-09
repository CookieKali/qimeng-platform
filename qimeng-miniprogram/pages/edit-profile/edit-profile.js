var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var constants = require('../../utils/constants')
var fieldText = require('../../utils/fieldText')
var profileGuide = require('../../utils/profileGuide')
var api = apiModule.api

var ROLE_OPTIONS = ['创始合伙人', '企业主', '投资人', '专家', '合伙人', '销售']
var BIZMAP_MAX = 3

function buildRoleList(roles, options) {
  var list = roles || []
  return (options || ROLE_OPTIONS).map(function (opt) {
    return { label: opt, selected: list.indexOf(opt) > -1 }
  })
}

function pickProfileText(p, keys) {
  if (!p) return ''
  for (var i = 0; i < keys.length; i++) {
    var v = p[keys[i]]
    var text = fieldText.toPlainText(v)
    if (text) return text
  }
  return ''
}

function normalizeRoles(raw) {
  if (Array.isArray(raw)) {
    return raw.map(function (r) { return fieldText.toPlainText(r) }).filter(Boolean)
  }
  return []
}

function honorsToText(honors) {
  if (!Array.isArray(honors)) return ''
  return honors.map(function (h) {
    if (typeof h === 'string') return h.trim()
    if (h && h.name) {
      return h.year ? String(h.name) + ' (' + String(h.year) + ')' : String(h.name)
    }
    return ''
  }).filter(Boolean).join('\n')
}

function normalizeBizmap(list) {
  if (!Array.isArray(list) || !list.length) {
    return [{ industry: '', role: '', biz: '' }]
  }
  var rows = list.slice(0, BIZMAP_MAX).map(function (item) {
    item = item || {}
    return {
      industry: fieldText.toPlainText(item.category || item.industry || item.co),
      role: fieldText.toPlainText(item.position || item.role),
      biz: fieldText.toPlainText(item.biz)
    }
  })
  return rows.length ? rows : [{ industry: '', role: '', biz: '' }]
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false
  var keysA = Object.keys(a)
  var keysB = Object.keys(b)
  if (keysA.sort().length !== keysB.sort().length) return false
  for (var i = 0; i < keysA.length; i++) {
    var key = keysA[i]
    if (!keysB.includes(key)) return false
    if (typeof a[key] === 'object' && a[key] !== null) {
      if (!deepEqual(a[key], b[key])) return false
    } else if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}

Page({
  data: {
    headerHeight: 64,
    statusBarHeight: 20,
    safeBottom: 0,
    industryOptions: constants.INDUSTRIES,
    regions: constants.REGIONS,
    industryIndex: 0,
    regionIndex: 0,
    roleOptions: ROLE_OPTIONS,
    roleList: buildRoleList([], ROLE_OPTIONS),
    form: {
      name: '',
      job: '',
      co: '',
      phone: '',
      email: '',
      city: '',
      industry: '',
      personalValue: '',
      talentsText: '',
      resourcesText: '',
      needsText: '',
      roles: [],
      honorsText: '',
      bizmap: [{ industry: '', role: '', biz: '' }]
    },
    canAddBizmap: true,
    saving: false,
    saveStatus: 'idle',
    saveErrorMsg: '',
    lastSavedForm: null,
    fromGuide: false,
    loading: true,
    fieldMissing: profileGuide.computeFieldMissing({})
  },

  onLoad: function (options) {
    var self = this
    var insets = layout.getPageInsets()
    var app = getApp()
    var raw = app.globalData.editProfileForm || {}
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      safeBottom: app.globalData.safeBottom || 0,
      fromGuide: !!(options && options.from === 'guide')
    })
    Promise.all([
      api.auth.me().catch(function () { return null }),
      api.profile.get().catch(function () { return null })
    ]).then(function (results) {
      var me = results[0] || {}
      var p = results[1] || {}
      var user = app.globalData.user || {}
      self._applyFormFromRaw(Object.assign({}, raw, {
        name: raw.name || me.name || user.name || '',
        job: raw.job || p.job_title || '',
        co: raw.co || p.company || '',
        phone: raw.phone || me.phone || user.phone || '',
        email: raw.email || me.email || user.email || '',
        city: raw.city || p.city || p.region || '',
        industry: raw.industry || p.industry || '',
        personalValue: raw.personalValue || pickProfileText(p, ['personal_value', 'bio']),
        talentsText: raw.talentsText || pickProfileText(p, ['talents_text', 'talents']),
        resourcesText: raw.resourcesText || pickProfileText(p, ['resources_text', 'status_supply', 'resources']),
        needsText: raw.needsText || pickProfileText(p, ['needs_text', 'status_demand', 'needs']),
        roles: raw.roles || normalizeRoles(p.roles || p.tags),
        honorsText: raw.honorsText || honorsToText(p.honors),
        bizmap: raw.bizmap || normalizeBizmap(p.business_map)
      }))
      self.setData({
        lastSavedForm: JSON.parse(JSON.stringify(self.data.form)),
        loading: false
      })
    }).catch(function () {
      self._applyFormFromRaw(raw)
      self.setData({ loading: false })
    })
  },

  onUnload: function () {
  },

  _applyFormFromRaw: function (raw) {
    var industry = constants.normalizeIndustry(raw.industry || '')
    var industryIndex = industry ? constants.industryPickerIndex(industry) : 0
    var city = raw.city || raw.addr || ''
    var regionIndex = city ? Math.max(0, constants.REGIONS.indexOf(city)) : 0
    var bizmap = normalizeBizmap(raw.bizmap)
    var roles = normalizeRoles(raw.roles)
    var form = {
      name: fieldText.toPlainText(raw.name),
      job: fieldText.toPlainText(raw.job),
      co: fieldText.toPlainText(raw.co),
      phone: fieldText.toPlainText(raw.phone),
      email: fieldText.toPlainText(raw.email),
      city: city,
      industry: industry,
      personalValue: fieldText.toPlainText(raw.personalValue),
      talentsText: fieldText.toPlainText(raw.talentsText),
      resourcesText: fieldText.toPlainText(raw.resourcesText),
      needsText: fieldText.toPlainText(raw.needsText),
      roles: roles,
      honorsText: fieldText.toPlainText(raw.honorsText),
      bizmap: bizmap
    }
    this.setData({
      industryIndex: industryIndex,
      regionIndex: regionIndex,
      canAddBizmap: bizmap.length < BIZMAP_MAX,
      roleList: buildRoleList(roles, ROLE_OPTIONS),
      form: form,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  onCancel: function () {
    var self = this
    var hasChanges = this.data.lastSavedForm && !deepEqual(this.data.form, this.data.lastSavedForm)
    
    if (hasChanges) {
      wx.showModal({
        title: '提示',
        content: '您有未保存的更改，确定要离开吗？',
        confirmText: '保存后离开',
        cancelText: '直接离开',
        success: function (res) {
          if (res.confirm) {
            self.saveEdit(function () {
              wx.navigateBack()
            })
          } else {
            wx.navigateBack()
          }
        }
      })
    } else {
      wx.navigateBack()
    }
  },

  onField: function (e) {
    var key = e.currentTarget.dataset.key
    var form = Object.assign({}, this.data.form)
    form[key] = e.detail.value
    this.setData({
      form: form,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  onIndustryChange: function (e) {
    var idx = parseInt(e.detail.value, 10) || 0
    var industry = this.data.industryOptions[idx] || ''
    var form = Object.assign({}, this.data.form, { industry: industry })
    this.setData({
      industryIndex: idx,
      form: form,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  onRegionChange: function (e) {
    var idx = parseInt(e.detail.value, 10) || 0
    var city = this.data.regions[idx] || ''
    var form = Object.assign({}, this.data.form, { city: city })
    this.setData({
      regionIndex: idx,
      form: form,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  toggleRole: function (e) {
    var role = e.currentTarget.dataset.role
    if (!role) return
    var roles = (this.data.form.roles || []).slice()
    var idx = roles.indexOf(role)
    if (idx > -1) {
      roles.splice(idx, 1)
    } else {
      roles.push(role)
    }
    var form = Object.assign({}, this.data.form, { roles: roles })
    this.setData({
      form: form,
      roleList: buildRoleList(roles, ROLE_OPTIONS),
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  onBizmapField: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var key = e.currentTarget.dataset.key
    if (isNaN(index) || index < 0 || !key) return
    var bizmap = (this.data.form.bizmap || []).slice()
    if (!bizmap[index]) bizmap[index] = { industry: '', role: '', biz: '' }
    bizmap[index] = Object.assign({}, bizmap[index])
    bizmap[index][key] = e.detail.value
    var form = Object.assign({}, this.data.form, { bizmap: bizmap })
    this.setData({
      form: form,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  addBizmapRow: function () {
    var bizmap = (this.data.form.bizmap || []).slice()
    if (bizmap.length >= BIZMAP_MAX) return
    bizmap.push({ industry: '', role: '', biz: '' })
    var form = Object.assign({}, this.data.form, { bizmap: bizmap })
    this.setData({
      form: form,
      canAddBizmap: bizmap.length < BIZMAP_MAX,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  removeBizmapRow: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    if (isNaN(index) || index < 0) return
    var bizmap = (this.data.form.bizmap || []).slice()
    bizmap.splice(index, 1)
    if (!bizmap.length) bizmap.push({ industry: '', role: '', biz: '' })
    var form = Object.assign({}, this.data.form, { bizmap: bizmap })
    this.setData({
      form: form,
      canAddBizmap: bizmap.length < BIZMAP_MAX,
      fieldMissing: profileGuide.computeFieldMissing(form)
    })
  },

  _buildSavePayload: function () {
    var form = this.data.form
    var industry = fieldText.toPlainText(form.industry)
    var city = fieldText.toPlainText(form.city)
    return {
      name: fieldText.toPlainText(form.name),
      email: fieldText.toPlainText(form.email),
      job: fieldText.toPlainText(form.job),
      co: fieldText.toPlainText(form.co),
      industry: industry,
      city: city,
      saveBody: {
        name: fieldText.toPlainText(form.name),
        email: fieldText.toPlainText(form.email),
        job_title: fieldText.toPlainText(form.job),
        company: fieldText.toPlainText(form.co),
        industry: industry,
        city: city,
        region: city,
        personal_value: fieldText.toPlainText(form.personalValue),
        talents_text: fieldText.toPlainText(form.talentsText),
        resources_text: fieldText.toPlainText(form.resourcesText),
        needs_text: fieldText.toPlainText(form.needsText),
        roles: form.roles || [],
        honors: (form.honorsText || '').split('\n').map(function (line) {
          return line.trim()
        }).filter(Boolean),
        business_map: (form.bizmap || []).filter(function (b) {
          return b && (b.biz || b.role || b.industry)
        }).map(function (b) {
          return {
            category: fieldText.toPlainText(b.industry),
            position: fieldText.toPlainText(b.role),
            biz: fieldText.toPlainText(b.biz)
          }
        })
      }
    }
  },

  onSaveTap: function () {
    this.saveEdit()
  },

  saveEdit: function (callback) {
    var self = this
    // bindtap 会把事件对象作为第一个参数传入，不能当作 callback
    if (typeof callback !== 'function') {
      callback = null
    }
    if (self.data.saving) return
    var payload = this._buildSavePayload()
    if (!payload.name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (!payload.job) {
      wx.showToast({ title: '请填写职务', icon: 'none' })
      return
    }
    if (!payload.industry) {
      wx.showToast({ title: '请选择行业', icon: 'none' })
      return
    }
    self.setData({ saving: true, saveStatus: 'saving', saveErrorMsg: '' })
    api.profile.saveAll(payload.saveBody).then(function () {
      var app = getApp()
      var incomplete = profileGuide.syncProfileHint(
        { name: payload.name },
        {
          job_title: payload.saveBody.job_title,
          region: payload.saveBody.region,
          industry: payload.saveBody.industry
        }
      )
      app.globalData.profileNeedRefresh = true
      app.globalData.contactsNeedRefresh = true
      if (app.globalData.user) {
        app.globalData.user.name = payload.name
        app.globalData.user.email = payload.email
      }
      self.setData({
        saving: false,
        saveStatus: 'saved',
        saveErrorMsg: '',
        'form.name': payload.name,
        'form.industry': payload.industry,
        'form.city': payload.city,
        lastSavedForm: JSON.parse(JSON.stringify(self.data.form)),
        fieldMissing: profileGuide.computeFieldMissing(self.data.form)
      })
      wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 })
      if (callback) {
        setTimeout(callback, 800)
      } else {
        setTimeout(function () {
          wx.navigateBack()
        }, 800)
      }
    }).catch(function (err) {
      var msg = (err && err.message) || '保存失败'
      if (msg === '请求失败') msg = '保存失败，请重新编译小程序后重试'
      self.setData({ saving: false, saveStatus: 'error', saveErrorMsg: msg })
      wx.showToast({ title: msg, icon: 'none', duration: 2800 })
    })
  }
})
