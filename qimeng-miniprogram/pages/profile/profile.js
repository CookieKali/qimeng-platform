var apiModule = require('../../utils/api')
var layout = require('../../utils/layout')
var tabUtil = require('../../utils/tab')
var constants = require('../../utils/constants')
var profileGuide = require('../../utils/profileGuide')
var fieldText = require('../../utils/fieldText')
var api = apiModule.api
var CLV = apiModule.CLV
var AVOS = apiModule.AVOS
var avatarColors = apiModule.avatarColors
var resolveAvatarUrl = apiModule.resolveAvatarUrl
var creditLvClass = apiModule.creditLvClass
var lvClass = apiModule.lvClass
var cardPreviewUtil = require('../../utils/cardPreview')
var cardPoster = require('../../utils/cardPoster')

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    sub: 0,
    MY: {},
    myAv: { imgUrl: null, bg: '#0c1e38', c: '#5cb8ff' },
    myProfile: {},
    myRoles: [],
    myHonors: [],
    myBizmap: [],
    clvData: {},
    clvList: [],
    creditPct: 0,
    creditLogs: [],
    walletRules: [
      '积分仅限平台内任务兑付和服务购买',
      '积分不可反向兑换法定货币',
      '发布任务时全额冻结至平台托管账户',
      '所有交易均留存区块链存证'
    ],
    walletLogs: [],
    avOptions: AVOS,
    myActRecords: [],
    myTaskRecords: [],
    expandedSections: {},
    modal: null,
    rechargeAmount: '',
    membershipRoleLabel: '标准会员',
    membershipModal: null,
    membershipTier: 'basic',
    membershipOrder: null,
    membershipOrders: [],
    membershipTiers: [
      { key: 'basic', name: '基础版', price: '1万' },
      { key: 'pro', name: '专业版', price: '3万' },
      { key: 'flagship', name: '旗舰版', price: '10万' }
    ],
    industryOptions: constants.INDUSTRIES,
    industryIndex: 0,
    profileCompleteness: 100,
    pcFillClass: 'pc-fill-green',
    hasCardPreview: false,
    shareMode: '',
    inviteCode: ''
  },

  onLoad: function () {
    this.setData(layout.getPageInsets())
  },

  onShow: function () {
    tabUtil.setTab(this, 2)
    if (getApp().globalData.profileNeedRefresh) {
      getApp().globalData.profileNeedRefresh = false
    }
    this._load()
  },

  _buildCardPreviewData: function () {
    return cardPreviewUtil.buildCardPreview({
      MY: this.data.MY,
      myProfile: this.data.myProfile,
      myRoles: this.data.myRoles,
      myBizmap: this.data.myBizmap,
      myAv: this.data.myAv
    })
  },

  _updateCardPreviewFlag: function (MY, mp) {
    var p = mp || {}
    var has = !!(
      (MY && (MY.job || MY.co || MY.city || MY.industry)) ||
      p.personalValue || p.talent || p.resourcesText || p.needsText
    )
    this.setData({ hasCardPreview: has })
  },

  _load: function () {
    var self = this
    var app = getApp()

    api.auth.me().then(function (me) {
      app.globalData.user = me
      self._applyUserData(me)
    }).catch(function () {
      var user = app.globalData.user
      if (user) self._applyUserData(user)
    })

    api.credit.transactions().then(function (data) {
      var logs = (data.items || []).slice(0, 15).map(function (t) {
        var isIn = t.amount > 0
        return {
          t: t.note || t.type || '',
          v: (isIn ? '+' : '') + (t.amount || 0),
          c: isIn ? '#28e880' : '#ff8888',
          d: t.created_at ? t.created_at.slice(0, 10) : ''
        }
      })
      self.setData({ walletLogs: logs })
    }).catch(function () {})

    api.membership.myOrders().then(function (data) {
      var orders = (data.items || []).map(function (o) {
        return Object.assign({}, o, { amountYuan: (o.amount || 0) / 100 })
      })
      self.setData({ membershipOrders: orders })
    }).catch(function () {})

    api.tasks.my().then(function (data) {
      var posted = (data.posted || []).map(function (t) {
        return {
          id: t.id,
          title: t.title || ('任务 #' + t.id),
          creditsStr: String(t.pool || 0),
          status: t.status || '',
          isPosted: true
        }
      })
      var joined = (data.joined || []).map(function (t) {
        return {
          id: t.id,
          title: '已承接任务 #' + t.id,
          creditsStr: String(t.paid || 0),
          status: t.status || '',
          isPosted: false
        }
      })
      self.setData({ myTaskRecords: posted.concat(joined) })
    }).catch(function () {})
  },

  _applyUserData: function (user) {
    var self = this
    var creditLv = user.reputation_level || 'A'
    var lv = user.is_paid ? 'VIP' : '标准'
    var membershipRoleLabel = '标准会员'
    if (user.role === 'partner') membershipRoleLabel = '合伙人'
    else if (user.role === 'paid' || user.is_paid) membershipRoleLabel = '付费会员'
    var clv = CLV[creditLv] || CLV.A
    var score = user.reputation_executor || user.reputation_initiator || 0
    var pct = Math.round((score / 1000) * 100)
    var clvList = Object.keys(CLV).map(function (k) {
      return Object.assign({}, CLV[k], { isCurrent: k === creditLv })
    })
    var colors = avatarColors(user.id || 0)
    var storedAv = wx.getStorageSync('qm_avatar') || null
    var serverImg = resolveAvatarUrl(user.avatar_url)
    var myAv = {
      imgUrl: serverImg || null,
      bg: (storedAv && storedAv.bg) || colors.bg,
      c: (storedAv && storedAv.c) || colors.c
    }

    var enrichedMY = {
      id: user.id,
      name: user.name || '',
      nameAbbr: (user.name || '').slice(0, 2),
      phone: user.phone || '',
      email: user.email || '',
      role: user.role || '',
      job: '',
      co: '',
      city: '',
      industry: '',
      addr: '',
      lv: lv,
      lvClass: lvClass(lv),
      creditLv: creditLv,
      creditLvClass: creditLvClass(creditLv),
      creditScore: score,
      points: user.credit_balance || 0,
      pointsStr: String(user.credit_balance || 0),
      inviteCode: user.invite_code || '',
      invitedCount: 0
    }

    var basePct = profileGuide.computeCompleteness(user, null, {})
    this.setData({
      MY: enrichedMY,
      myAv: myAv,
      clvData: clv,
      clvList: clvList,
      creditPct: pct,
      membershipRoleLabel: membershipRoleLabel,
      profileCompleteness: basePct,
      pcFillClass: profileGuide.pcFillClass(basePct)
    })
    this._updateCardPreviewFlag(enrichedMY, this.data.myProfile)

    if (user.id) {
      api.users.detail(user.id).then(function (data) {
        if (!data) return
        var card = data.card || {}
        var updatedMY = Object.assign({}, self.data.MY, {
          job: card.job_title || '',
          co: card.company || '',
          city: card.region || '',
          industry: constants.normalizeIndustry(card.industry || ''),
          addr: card.region || ''
        })
        var pct = profileGuide.computeCompleteness(data, card, {
          job: updatedMY.job,
          co: updatedMY.co,
          city: updatedMY.city,
          industry: updatedMY.industry,
          personalValue: card.bio || ''
        })
        var myProfile = {
          phone: data.phone || '',
          email: data.email || '',
          addr: card.region || '',
          talent: fieldText.toPlainText(card.talents),
          personalValue: fieldText.toPlainText(card.bio),
          resourcesText: fieldText.toPlainText(card.status_supply || card.resources),
          needsText: fieldText.toPlainText(card.status_demand || card.needs),
          interest: fieldText.toPlainText(card.interests)
        }
        self.setData({
          MY: updatedMY,
          myProfile: myProfile,
          profileCompleteness: pct,
          pcFillClass: profileGuide.pcFillClass(pct)
        })
        self._updateCardPreviewFlag(updatedMY, myProfile)
      }).catch(function () {})

      api.profile.get().then(function (p) {
        if (!p) return
        var roles = Array.isArray(p.roles) ? p.roles : (Array.isArray(p.tags) ? p.tags : [])
        var honors = []
        if (Array.isArray(p.honors)) {
          honors = p.honors.map(function (h) {
            if (typeof h === 'string') return h
            if (h && h.name) return h.year ? h.name + ' (' + h.year + ')' : h.name
            return ''
          }).filter(Boolean)
        }
        var bizmap = []
        if (Array.isArray(p.business_map)) {
          bizmap = p.business_map.slice(0, 3).map(function (item) {
            item = item || {}
            return {
              industry: item.category || item.industry || item.co || '',
              role: item.position || item.role || '',
              biz: item.biz || ''
            }
          })
        }
        self.setData({
          myRoles: roles,
          myHonors: honors,
          myBizmap: bizmap
        })
      }).catch(function () {})
    }
  },

  goEditProfile: function () {
    this.showEditModal()
  },

  switchSub: function (e) {
    this.setData({ sub: parseInt(e.currentTarget.dataset.n), expandedSections: {}, modal: null })
  },

  toggleSection: function (e) {
    var key = e.currentTarget.dataset.key
    var sections = Object.assign({}, this.data.expandedSections)
    sections[key] = !sections[key]
    this.setData({ expandedSections: sections })
  },

  showEditModal: function () {
    var MY = this.data.MY
    var industry = constants.normalizeIndustry(MY.industry || '')
    var mp = this.data.myProfile || {}
    getApp().globalData.editProfileForm = {
      name: MY.name,
      job: MY.job,
      co: MY.co,
      phone: MY.phone,
      email: MY.email,
      addr: MY.city,
      city: MY.city,
      industry: industry,
      personalValue: fieldText.toPlainText(mp.personalValue),
      talentsText: fieldText.toPlainText(mp.talent),
      resourcesText: fieldText.toPlainText(mp.resourcesText),
      needsText: fieldText.toPlainText(mp.needsText),
      roles: this.data.myRoles || [],
      honorsText: (this.data.myHonors || []).join('\n'),
      bizmap: this.data.myBizmap || []
    }
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' })
  },

  showAvatarModal: function () { this.setData({ modal: 'avatar' }) },
  showInviteModal: function () { this.setData({ modal: 'invite' }) },
  goContribution: function () {
    wx.navigateTo({ url: '/pages/contribution/contribution' })
  },
  goProfit: function () {
    wx.navigateTo({ url: '/pages/profit/profit' })
  },
  showCardPreview: function () {
    this.setData({ modal: 'cardPreview', shareMode: 'card' })
  },

  prepareCardShare: function () {
    this.setData({ shareMode: 'card' })
  },

  saveCardImage: function () {
    var preview = this._buildCardPreviewData()
    if (!preview || !preview.userId) {
      wx.showToast({ title: '名片数据未就绪', icon: 'none' })
      return
    }
    wx.showLoading({ title: '生成中', mask: true })
    cardPoster.exportCardPoster(this, preview).then(function (filePath) {
      wx.hideLoading()
      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success: function () {
          wx.showToast({ title: '已保存到相册', icon: 'success' })
        },
        fail: function (err) {
          if (err && err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许保存图片到相册',
              confirmText: '去设置',
              success: function (r) {
                if (r.confirm) wx.openSetting({})
              }
            })
            return
          }
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      })
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '生成图片失败', icon: 'none' })
    })
  },

  _triggerInviteShare: function () {
    var self = this
    api.channel.myLink().then(function (data) {
      var code = (data && data.invite_code) || ''
      self.setData({ shareMode: 'invite', inviteCode: code })
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage']
      })
    }).catch(function () {
      self.setData({ shareMode: 'invite', inviteCode: '' })
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage']
      })
    })
  },

  showShareModal: function () {
    this._triggerInviteShare()
  },

  shareMyCard: function () {
    this.setData({ shareMode: 'card', modal: 'cardPreview' })
  },

  pickAvatar: function (e) {
    var idx = e.currentTarget.dataset.idx
    var opt = AVOS[idx]
    var myAv = Object.assign({}, this.data.myAv, { bg: opt.bg, c: opt.c, imgUrl: null })
    wx.setStorageSync('qm_avatar', myAv)
    this.setData({ myAv: myAv })
  },

  chooseAvatar: function () {
    var self = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var filePath = res.tempFilePaths[0]
        if (!filePath) return
        wx.showLoading({ title: '上传中', mask: true })
        api.users.uploadAvatar(filePath).then(function (data) {
          wx.hideLoading()
          var url = resolveAvatarUrl(data && data.avatar_url)
          var myAv = Object.assign({}, self.data.myAv, { imgUrl: url })
          self.setData({ myAv: myAv })
          var appInst = getApp()
          if (appInst.globalData.user) {
            appInst.globalData.user.avatar_url = data.avatar_url
          }
          wx.showToast({ title: '头像已更新', icon: 'success' })
        }).catch(function () {
          wx.hideLoading()
        })
      }
    })
  },

  recharge: function () {
    this.setData({ modal: 'recharge', rechargeAmount: '' })
  },

  onRechargeAmount: function (e) {
    this.setData({ rechargeAmount: e.detail.value })
  },

  confirmRecharge: function () {
    var self = this
    var amount = parseInt(this.data.rechargeAmount, 10)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效充值金额', icon: 'none' })
      return
    }
    api.credit.recharge(amount).then(function () {
      self.setData({ modal: null, rechargeAmount: '' })
      wx.showToast({ title: '充值成功', icon: 'success' })
      self._load()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '充值失败，请重试', icon: 'none' })
    })
  },

  copyCode: function () {
    var code = this.data.MY.inviteCode || ''
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '邀请码已复制', icon: 'success' })
      }
    })
  },

  shareMP: function () {
    this._triggerInviteShare()
  },
  addRole: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' })
  },
  addHonor: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' })
  },
  addBiz: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' })
  },

  openActDetail: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.setStorageSync('qm_open_activity_id', id)
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },
  openTaskDetail: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    wx.setStorageSync('qm_open_task_id', id)
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  doLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确认退出企盟？',
      success: function (res) {
        if (res.confirm) {
          wx.removeStorageSync('qm_token')
          wx.removeStorageSync('qm_avatar')
          wx.removeStorageSync('qm_my_signups')
          var appInst = getApp()
          appInst.globalData.token = ''
          appInst.globalData.user = null
          wx.reLaunch({ url: '/pages/login/login' })
        }
      }
    })
  },

  closeModal: function () {
    this.setData({ modal: null })
  },
  stopProp: function () {},

  showUpgradeModal: function () {
    this.setData({
      membershipModal: 'tier',
      membershipTier: 'basic',
      membershipOrder: null
    })
  },

  selectTier: function (e) {
    this.setData({ membershipTier: e.currentTarget.dataset.tier })
  },

  confirmOrder: function () {
    var self = this
    var tier = this.data.membershipTier
    api.membership.createOrder(tier).then(function (order) {
      var amountYuan = (order.amount || 0) / 100
      self.setData({
        membershipOrder: Object.assign({}, order, { amountYuan: amountYuan }),
        membershipModal: 'pay'
      })
    }).catch(function () {})
  },

  doMockPay: function () {
    var self = this
    var order = this.data.membershipOrder
    if (!order || !order.id) {
      wx.showToast({ title: '无待支付订单', icon: 'none' })
      return
    }
    api.membership.mockPay(order.id).then(function () {
      wx.showToast({ title: '支付成功', icon: 'success' })
      self.setData({ membershipModal: null, membershipOrder: null })
      self._load()
    }).catch(function () {})
  },

  closeMembershipModal: function () {
    this.setData({ membershipModal: null, membershipOrder: null })
  },

  onShareAppMessage: function () {
    if (this.data.shareMode === 'card') {
      var MY = this.data.MY || {}
      return {
        title: (MY.name || '我') + ' · 企盟数字名片',
        path: '/pages/contacts/contacts?userId=' + (MY.id || '')
      }
    }
    if (this.data.shareMode === 'invite') {
      var code = this.data.inviteCode || ''
      return {
        title: '邀请你加入企盟，拓展优质人脉',
        path: '/pages/login/login?ref=' + code
      }
    }
    return {
      title: '企盟',
      path: '/pages/login/login'
    }
  }
})
