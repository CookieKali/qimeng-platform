var layout = require('./utils/layout')

App({
  globalData: {
    token: '',
    user: null,
    taskNeedRefresh: false,
    activityNeedRefresh: false,
    profileNeedRefresh: false,
    editProfileForm: null,
    statusBarHeight: 20,
    headerHeight: 64,
    tabBarHeight: 56,
    safeBottom: 0,
    pageBottom: 62
  },

  onLaunch: function () {
    layout.initAppLayout(this)
    var token = wx.getStorageSync('qm_token')
    if (token) {
      this.globalData.token = token
    }
  },

  onError: function (err) {
    console.error('[App onError]', typeof err === 'string' ? err : JSON.stringify(err))
  }
})
