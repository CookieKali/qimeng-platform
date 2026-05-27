var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var constants = require('../../utils/constants')
var fieldText = require('../../utils/fieldText')
var api = apiModule.api

var ROLE_OPTIONS = ['创始合伙人', '企业主', '投资人', '专家', '合伙人', '销售']
var BIZMAP_MAX = 3

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
    saving: false
  },

  onLoad: function () {
    var self = this
    var insets = layout.getPageInsets()
    var app = getApp()
    var raw = app.globalData.editProfileForm || {}
    this.setData({
      headerHeight: insets.headerHeight,
      statusBarHeight: app.globalData.statusBarHeight || 20,
      safeBottom: app.globalData.safeBottom || 0
    })
    this._applyFormFromRaw(raw)
    api.profile.get().then(function (p) {
      if (!p) return
      self._applyFormFromRaw(Object.assign({}, raw, {
        name: raw.name,
        job: raw.job || p.job_title || '',
        co: raw.co || p.company || '',
        phone: raw.phone,
        email: raw.email,
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
    }).catch(function () {})
  },

  _applyFormFromRaw: function (raw) {
    var industry = constants.normalizeIndustry(raw.industry || '')
    var industryIndex = industry ? constants.industryPickerIndex(industry) : 0
    var city = raw.city || raw.addr || ''
    var regionIndex = city ? Math.max(0, constants.REGIONS.indexOf(city)) : 0
    var bizmap = normalizeBizmap(raw.bizmap)
    this.setData({
      industryIndex: industryIndex,
      regionIndex: regionIndex,
      canAddBizmap: bizmap.length < BIZMAP_MAX,
      form: {
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
        roles: normalizeRoles(raw.roles),
        honorsText: fieldText.toPlainText(raw.honorsText),
        bizmap: bizmap
      }
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

  onIndustryChange: function (e) {
    var idx = parseInt(e.detail.value, 10) || 0
    this.setData({
      industryIndex: idx,
      'form.industry': this.data.industryOptions[idx]
    })
  },

  onRegionChange: function (e) {
    var idx = parseInt(e.detail.value, 10) || 0
    this.setData({
      regionIndex: idx,
      'form.city': this.data.regions[idx]
    })
  },

  onRolesChange: function (e) {
    this.setData({ 'form.roles': e.detail.value || [] })
  },

  onBizmapField: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var key = e.currentTarget.dataset.key
    if (isNaN(index) || index < 0 || !key) return
    var bizmap = (this.data.form.bizmap || []).slice()
    if (!bizmap[index]) bizmap[index] = { industry: '', role: '', biz: '' }
    bizmap[index] = Object.assign({}, bizmap[index])
    bizmap[index][key] = e.detail.value
    this.setData({ 'form.bizmap': bizmap })
  },

  addBizmapRow: function () {
    var bizmap = (this.data.form.bizmap || []).slice()
    if (bizmap.length >= BIZMAP_MAX) return
    bizmap.push({ industry: '', role: '', biz: '' })
    this.setData({
      'form.bizmap': bizmap,
      canAddBizmap: bizmap.length < BIZMAP_MAX
    })
  },

  removeBizmapRow: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    if (isNaN(index) || index < 0) return
    var bizmap = (this.data.form.bizmap || []).slice()
    bizmap.splice(index, 1)
    this.setData({
      'form.bizmap': bizmap,
      canAddBizmap: bizmap.length < BIZMAP_MAX
    })
  },

  saveEdit: function () {
    var self = this
    if (self.data.saving) return
    var form = self.data.form
    var name = fieldText.toPlainText(form.name)
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    self.setData({ saving: true })
    var profileBody = {
      job_title: fieldText.toPlainText(form.job),
      company: fieldText.toPlainText(form.co),
      industry: fieldText.toPlainText(form.industry),
      city: fieldText.toPlainText(form.city),
      region: fieldText.toPlainText(form.city),
      personal_value: fieldText.toPlainText(form.personalValue),
      talents_text: fieldText.toPlainText(form.talentsText),
      resources_text: fieldText.toPlainText(form.resourcesText),
      needs_text: fieldText.toPlainText(form.needsText),
      roles: form.roles || [],
      honors: (form.honorsText || '').split('\n').map(function (line) {
        return line.trim()
      }).filter(Boolean),
      business_map: (form.bizmap || []).filter(function (b) {
        return b && (b.biz || b.role)
      }).map(function (b) {
        return {
          category: fieldText.toPlainText(b.industry),
          position: fieldText.toPlainText(b.role),
          biz: fieldText.toPlainText(b.biz)
        }
      })
    }
    api.auth.updateMe({
      name: name,
      email: fieldText.toPlainText(form.email)
    }).then(function () {
      return api.profile.update(profileBody)
    }).then(function () {
      getApp().globalData.profileNeedRefresh = true
      self.setData({ saving: false })
      wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 })
      setTimeout(function () {
        wx.navigateBack()
      }, 1200)
    }).catch(function (err) {
      self.setData({ saving: false })
      var msg = (err && err.message) || '保存失败'
      if (msg === '请求失败') msg = '保存失败，请确认后端已启动并重试'
      wx.showToast({ title: msg, icon: 'none', duration: 2500 })
    })
  }
})
