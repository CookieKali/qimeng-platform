var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var appConfig = require('../../config')
var profileGuide = require('../../utils/profileGuide')
var api = apiModule.api

Page({
  data: {
    headerHeight: 64,
    isRegister: false,
    phone: '123456',
    password: '123456',
    regName: '',
    inviteCode: '',
    loginErr: '',
    loading: false,
    apiHint: ''
  },

  onLoad: function (options) {
    var insets = layout.getPageInsets()
    var base = appConfig.resolveApiBase()
    var hint = appConfig.isDevtools()
      ? '模拟器 API：' + base
      : '真机 API：' + base + '（需与电脑同一 WiFi）'
    var patch = {
      headerHeight: insets.headerHeight,
      apiHint: hint
    }
    if (options && options.ref) {
      patch.inviteCode = options.ref
      patch.isRegister = true
    }
    this.setData(patch)
  },

  switchMode: function () {
    this.setData({
      isRegister: !this.data.isRegister,
      loginErr: ''
    })
  },

  doLogin: function () {
    var self = this
    var d = this.data
    if (d.loading) return
    if (!d.phone || !d.password) {
      this.setData({ loginErr: '请填写手机号和密码' })
      return
    }
    this.setData({ loading: true, loginErr: '' })

    var p = d.isRegister
      ? api.auth.register({
          phone: d.phone,
          password: d.password,
          name: d.regName,
          invite_code: d.inviteCode
        })
      : api.auth.login(d.phone, d.password)

    p.then(function (data) {
      var app = getApp()
      wx.setStorageSync('qm_token', data.token)
      app.globalData.token = data.token
      app.globalData.user = { id: data.user_id, name: data.name, role: data.role }
      return api.auth.me().then(function (me) {
        app.globalData.user = Object.assign({}, app.globalData.user, me)
        if (!me.id) return null
        return api.users.detail(me.id).then(function (detail) {
          profileGuide.maybeSetShowGuide(me, detail && detail.card)
        }).catch(function () {
          profileGuide.maybeSetShowGuide(me, null)
        })
      }).catch(function () {
        profileGuide.maybeSetShowGuide(app.globalData.user, null)
      }).then(function () {
        self.setData({ loading: false })
        wx.switchTab({ url: '/pages/contacts/contacts' })
      })
    }).catch(function (err) {
      self.setData({
        loginErr: (err && err.message) ? err.message : '登录失败',
        loading: false
      })
    })
  }
})
