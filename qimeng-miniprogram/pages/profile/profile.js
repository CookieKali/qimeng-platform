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

var ACT_TYPE_CLASS = { '闭门沙龙': 'pp', '行业论坛': 'pt', '工作坊': 'pa', '资源对接': 'pc' }
var TASK_STATUS_LABELS = {
  open: '招募中',
  in_progress: '进行中',
  completed: '已完成',
  applied: '已报名',
  accepted: '已录用',
  submitted: '待验收',
  reviewed: '已验收'
}

function parseActivityType(description) {
  var d = description || ''
  var m = d.match(/^【([^】]+)】/)
  return { type: m ? m[1] : '活动', desc: m ? d.replace(/^【[^】]+】\s*/, '').trim() : d }
}

function fmtDateTime(s) {
  if (!s) return '—'
  return String(s).slice(0, 16).replace('T', ' ')
}

function getActivityStatus(startAt) {
  if (!startAt) return 'upcoming'
  var d = new Date(String(startAt).replace(' ', 'T'))
  if (isNaN(d.getTime())) return 'upcoming'
  var now = new Date()
  var diff = (d - now) / 86400000
  if (diff > 0.5) return 'upcoming'
  if (diff >= -0.5) return 'ongoing'
  return 'ended'
}

function mapActivityRecord(a) {
  var typeParsed = parseActivityType(a.description || '')
  var status = a.start_at ? getActivityStatus(a.start_at) : (a.status || 'upcoming')
  var statusLabels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束' }
  var statusClsMap = { upcoming: 'pg', ongoing: 'pa', ended: 'pgr' }
  var type = a.type || typeParsed.type || '活动'
  var desc = typeParsed.desc || a.description || ''
  var statusLabel = statusLabels[status] || '即将开始'
  var statusCls = statusClsMap[status] || 'pg'
  if (a.status === 'cancelled') {
    statusLabel = '已取消'
    statusCls = 'pgr'
  }
  return {
    id: a.id,
    title: a.title || ('活动 #' + a.id),
    date: a.start_at ? String(a.start_at).slice(0, 10) : '',
    space: a.location || '',
    type: type,
    typeClass: ACT_TYPE_CLASS[type] || 'pb',
    statusLabel: statusLabel,
    statusCls: statusCls,
    signups: a.signups != null ? a.signups : 0,
    seats: a.capacity || 0,
    descShort: desc.length > 48 ? desc.slice(0, 48) + '…' : desc,
    coverUrl: resolveAvatarUrl(a.cover_url)
  }
}

function buildTaskMetaMap(items) {
  var map = {}
  ;(items || []).forEach(function (t) {
    if (!t || t.id == null) return
    map[t.id] = t
  })
  return map
}

function resolveTaskTitle(t, metaById) {
  var meta = (metaById && metaById[t.id]) || {}
  var title = t.title || meta.title || ''
  if (typeof title === 'string') title = title.trim()
  return title || ('任务 #' + t.id)
}

function mapTaskRecord(t, isPosted, metaById) {
  var meta = (metaById && metaById[t.id]) || {}
  var merged = {
    id: t.id,
    title: resolveTaskTitle(t, metaById),
    category: t.category || meta.category || '其他',
    deliver_deadline: t.deliver_deadline || meta.deliver_deadline,
    pool: t.pool != null ? t.pool : meta.total_credit_pool,
    paid: t.paid != null ? t.paid : 0,
    status: isPosted ? (t.status || meta.status || 'open') : (t.status || t.task_status || 'applied')
  }
  var deadline = merged.deliver_deadline ? String(merged.deliver_deadline).slice(0, 10) : '—'
  var credits = isPosted ? (merged.pool || 0) : (merged.paid || 0)
  var statusClsMap = {
    open: 'pg', in_progress: 'pa', completed: 'pgr', cancelled: 'pgr',
    applied: 'pb', accepted: 'pa', submitted: 'pa', reviewed: 'pgr'
  }
  var desc = meta.description || t.description || ''
  return {
    id: merged.id,
    recordKey: (isPosted ? 'p' : 'j') + '-' + merged.id,
    title: merged.title,
    cat: merged.category,
    creditsStr: String(credits),
    creditsLabel: isPosted ? '总积分' : '积分',
    deadline: deadline,
    status: merged.status,
    statusLabel: TASK_STATUS_LABELS[merged.status] || merged.status,
    statusCls: statusClsMap[merged.status] || 'pb',
    isPosted: !!isPosted,
    coverUrl: resolveAvatarUrl(meta.cover_url || t.cover_url)
  }
}

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
    selectedTaskDetail: null,
    selectedActivityDetail: null,
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
    profileIncomplete: false,
    pcFillClass: 'pc-fill-green',
    hasCardPreview: false,
    shareMode: '',
    shareCode: '',
    shareData: null,
    inviteCode: ''
  },

  onLoad: function () {
    this.setData(layout.getPageInsets())
  },

  onShow: function () {
    tabUtil.setTab(this, 3)
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

    api.reputation.get().then(function (data) {
      var logs = (data.records || []).slice(0, 20).map(function (r, idx) {
        var delta = r.delta || 0
        var detail = r.detail
        var label = ''
        if (detail && typeof detail === 'object') {
          label = detail.note || detail.source || detail['修复'] || JSON.stringify(detail)
        } else {
          label = detail || r.dimension || r.role || '信用变动'
        }
        return {
          t: label,
          s: (delta > 0 ? '+' : '') + delta,
          d: r.at ? String(r.at).slice(0, 10) : '',
          _key: 'cr-' + (r.id || idx)
        }
      })
      self.setData({ creditLogs: logs })
    }).catch(function () {})

    api.activities.mySignups().then(function (data) {
      var items = data.items || []
      if (!items.length && (data.ids || []).length) {
        return api.activities.list().then(function (listData) {
          var idSet = {}
          ;(data.ids || []).forEach(function (id) { idSet[id] = true })
          items = (listData.items || []).filter(function (a) { return idSet[a.id] })
          self.setData({
            myActRecords: items.map(mapActivityRecord)
          })
        })
      }
      self.setData({ myActRecords: items.map(mapActivityRecord) })
    }).catch(function () {
      self.setData({ myActRecords: [] })
    })

    self._loadTaskRecords()
  },

  _loadTaskRecords: function () {
    var self = this
    Promise.all([
      api.tasks.my(),
      api.tasks.list({ page: 1, page_size: 100 })
    ]).then(function (results) {
      var myData = results[0] || {}
      var metaById = buildTaskMetaMap((results[1] && results[1].items) || [])
      var posted = (myData.posted || []).map(function (t) {
        return mapTaskRecord(t, true, metaById)
      })
      var joined = (myData.joined || []).map(function (t) {
        return mapTaskRecord(t, false, metaById)
      })
      self.setData({ myTaskRecords: posted.concat(joined), _taskMetaById: metaById })
    }).catch(function () {
      self.setData({ myTaskRecords: [] })
    })
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
    if (serverImg) {
      serverImg += (serverImg.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now()
    }
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
      invitedCount: user.invited_count || 0
    }

    var basePct = profileGuide.computeCompleteness(user, null, {})
    var incomplete = profileGuide.syncProfileHint(user, null)
    this.setData({
      MY: enrichedMY,
      myAv: myAv,
      clvData: clv,
      clvList: clvList,
      creditPct: pct,
      membershipRoleLabel: membershipRoleLabel,
      profileCompleteness: basePct,
      pcFillClass: profileGuide.pcFillClass(basePct),
      profileIncomplete: incomplete
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
        var incomplete = profileGuide.syncProfileHint(data, card)
        self.setData({
          MY: updatedMY,
          myProfile: myProfile,
          profileCompleteness: pct,
          pcFillClass: profileGuide.pcFillClass(pct),
          profileIncomplete: incomplete
        })
        tabUtil.setTab(self, 2, { hasProfileIncomplete: incomplete })
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
  showInviteModal: function () {
    var MY = this.data.MY || {}
    this.setData({
      modal: 'invite',
      shareMode: 'invite',
      inviteCode: MY.inviteCode || ''
    })
  },
  goSpaces: function () {
    wx.navigateTo({ url: '/pages/spaces/spaces' })
  },

  goContribution: function () {
    wx.navigateTo({ url: '/pages/contribution/contribution' })
  },
  goProfit: function () {
    wx.switchTab({ url: '/pages/profit/profit' })
  },
  goAdminBookings: function () {
    wx.navigateTo({ url: '/pages/admin-bookings/admin-bookings' })
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

  prepareShare: function (shareType) {
    var self = this
    wx.showLoading({ title: '生成分享链接', mask: true })
    api.cardShares.create(shareType, 'wechat').then(function (data) {
      wx.hideLoading()
      var shareCode = data.share_code || ''
      self.setData({ 
        shareMode: shareType, 
        shareCode: shareCode,
        shareData: data
      })
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage']
      })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    })
  },

  shareCard: function () {
    this.prepareShare('card')
    this.setData({ modal: 'cardPreview' })
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
    this.prepareShare('invite')
  },

  shareMyCard: function () {
    this.setData({ shareMode: 'card', modal: 'cardPreview' })
  },

  pickAvatar: function (e) {
    var idx = e.currentTarget.dataset.idx
    var opt = AVOS[idx]
    var self = this
    var applyDefault = function () {
      wx.showLoading({ title: '处理中', mask: true })
      api.users.deleteAvatar().then(function () {
        var myAv = Object.assign({}, self.data.myAv, { bg: opt.bg, c: opt.c, imgUrl: null })
        wx.setStorageSync('qm_avatar', myAv)
        self.setData({ myAv: myAv })
        var appInst = getApp()
        if (appInst.globalData.user) {
          appInst.globalData.user.avatar_url = ''
        }
        appInst.globalData.profileNeedRefresh = true
        wx.showToast({ title: '已使用默认头像', icon: 'success' })
      }).catch(function () {
        wx.showToast({ title: '操作失败', icon: 'none' })
      }).finally(function () {
        wx.hideLoading()
      })
    }
    if (self.data.myAv && self.data.myAv.imgUrl) {
      wx.showModal({
        title: '切换默认头像',
        content: '将清除已上传的自定义头像，是否继续？',
        success: function (res) {
          if (res.confirm) applyDefault()
        }
      })
      return
    }
    applyDefault()
  },

  _avatarUrlWithCache: function (path) {
    var url = resolveAvatarUrl(path)
    if (!url) return ''
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now()
  },

  _uploadAvatarFile: function (filePath) {
    var self = this
    wx.showLoading({ title: '上传中', mask: true })
    api.users.uploadAvatar(filePath).then(function (data) {
      var url = self._avatarUrlWithCache(data && data.avatar_url)
      var myAv = Object.assign({}, self.data.myAv, { imgUrl: url })
      wx.removeStorageSync('qm_avatar')
      self.setData({ myAv: myAv, modal: null })
      var appInst = getApp()
      if (appInst.globalData.user) {
        appInst.globalData.user.avatar_url = data.avatar_url
      }
      appInst.globalData.profileNeedRefresh = true
      wx.showToast({ title: '头像已更新', icon: 'success' })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    }).finally(function () {
      wx.hideLoading()
    })
  },

  chooseAvatar: function () {
    var self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        var path = file.tempFilePath
        wx.compressImage({
          src: path,
          quality: 80,
          success: function (cres) {
            self._uploadAvatarFile(cres.tempFilePath || path)
          },
          fail: function () {
            self._uploadAvatarFile(path)
          }
        })
      },
      fail: function () {
        wx.showToast({ title: '未选择图片', icon: 'none' })
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
    var MY = this.data.MY || {}
    var code = MY.inviteCode || ''
    if (!code) {
      wx.showToast({ title: '邀请码加载中', icon: 'none' })
      return
    }
    var text = '邀请你加入企盟，注册时填写邀请码：' + code
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '邀请信息已复制', icon: 'success' })
      }
    })
  },

  prepareInviteShare: function () {
    var MY = this.data.MY || {}
    this.setData({
      shareMode: 'invite',
      inviteCode: MY.inviteCode || this.data.inviteCode || ''
    })
  },

  shareMP: function () {
    this.prepareInviteShare()
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
    var self = this
    var cached = null
    ;(this.data.myActRecords || []).forEach(function (a) {
      if (Number(a.id) === id) cached = a
    })
    api.activities.detail(id).then(function (data) {
      if (!data) {
        wx.showToast({ title: '活动不存在', icon: 'none' })
        return
      }
      var typeParsed = parseActivityType(data.description)
      var parsed = mapActivityRecord(data)
      parsed.type = data.type || typeParsed.type || parsed.type
      parsed.typeClass = ACT_TYPE_CLASS[parsed.type] || parsed.typeClass
      if (cached) {
        parsed.title = cached.title || parsed.title
        parsed.date = cached.date || parsed.date
        parsed.space = cached.space || parsed.space
      }
      parsed.desc = typeParsed.desc || data.description || ''
      var signupCount = data.signups
      if (signupCount == null && data.checkins) signupCount = data.checkins.length
      parsed.seats = data.capacity || 0
      parsed.signups = signupCount != null ? signupCount : ((cached && cached.signups) || 0)
      parsed.host_name = data.host_name || '—'
      parsed.startTime = fmtDateTime(data.start_at)
      parsed.endTime = fmtDateTime(data.end_at)
      parsed.signupDeadline = fmtDateTime(data.signup_deadline)
      parsed.coverUrl = resolveAvatarUrl(data.cover_url)
      parsed.isJoined = true
      if (data.status === 'cancelled') {
        parsed.statusLabel = '已取消'
        parsed.statusCls = 'pgr'
      }
      self.setData({ modal: 'actRecord', selectedActivityDetail: parsed })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  openTaskDetail: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10)
    if (!id) return
    var self = this
    var record = null
    ;(this.data.myTaskRecords || []).forEach(function (t) {
      if (Number(t.id) === id) record = t
    })
    api.tasks.detail(id).then(function (data) {
      if (!data) {
        wx.showToast({ title: '任务不存在', icon: 'none' })
        return
      }
      var participants = data.participants || []
      var status = data.status || (record && record.status) || 'open'
      var statusClsMap = { open: 'pg', in_progress: 'pa', completed: 'pgr', cancelled: 'pgr' }
      var isPosted = record ? record.isPosted : false
      self.setData({
        modal: 'taskRecord',
        selectedTaskDetail: {
          id: data.id,
          title: data.title || (record && record.title) || ('任务 #' + id),
          cat: data.category || (record && record.cat) || '其他',
          desc: data.description || '',
          deadline: data.deliver_deadline
            ? String(data.deliver_deadline).slice(0, 10)
            : ((record && record.deadline) || '—'),
          creditsStr: String(
            isPosted
              ? (data.total_credit_pool || (record && record.creditsStr) || 0)
              : (data.base_credit_per_person || (record && record.creditsStr) || 0)
          ),
          creditsLabel: isPosted ? '任务总积分' : '单人积分',
          status: status,
          statusLabel: TASK_STATUS_LABELS[status] || status || '',
          statusCls: statusClsMap[status] || 'pb',
          minLv: data.min_reputation_level || 'B',
          joined: participants.length,
          quota: data.total_quota || 1,
          host_name: data.host_name || '—',
          host_job: data.host_job || '',
          host_level: data.host_level || '',
          coverUrl: resolveAvatarUrl(data.cover_url),
          isPosted: isPosted,
          isJoined: record ? !record.isPosted : false
        }
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
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
    this.setData({
      modal: null,
      selectedTaskDetail: null,
      selectedActivityDetail: null
    })
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

  _bindWxThen: function (next) {
    wx.login({
      success: function (res) {
        if (!res.code) {
          wx.showToast({ title: '微信登录失败', icon: 'none' })
          return
        }
        api.auth.wxBind(res.code).then(function () {
          next()
        }).catch(function (err) {
          wx.showToast({ title: (err && err.message) || '微信绑定失败', icon: 'none' })
        })
      },
      fail: function () {
        wx.showToast({ title: '无法调用 wx.login', icon: 'none' })
      }
    })
  },

  _runMockPay: function (orderId) {
    var self = this
    api.membership.mockPay(orderId).then(function () {
      wx.showToast({ title: '支付成功', icon: 'success' })
      self.setData({ membershipModal: null, membershipOrder: null })
      self._load()
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '支付失败', icon: 'none' })
    })
  },

  doMembershipPay: function () {
    var self = this
    var order = this.data.membershipOrder
    if (!order || !order.id) {
      wx.showToast({ title: '无待支付订单', icon: 'none' })
      return
    }

    var startPay = function () {
      api.payment.prepayMembership(order.id).then(function (data) {
        if (!data) return
        if (data.mode === 'mock') {
          self._runMockPay(order.id)
          return
        }
        if (data.mode === 'wechat' && data.payment) {
          var p = data.payment
          wx.requestPayment({
            timeStamp: p.timeStamp,
            nonceStr: p.nonceStr,
            package: p.package,
            signType: p.signType || 'RSA',
            paySign: p.paySign,
            success: function () {
              wx.showToast({ title: '支付成功', icon: 'success' })
              self.setData({ membershipModal: null, membershipOrder: null })
              self._load()
            },
            fail: function (err) {
              if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return
              wx.showToast({ title: '支付未完成', icon: 'none' })
            }
          })
          return
        }
        wx.showToast({ title: '支付参数异常', icon: 'none' })
      }).catch(function (err) {
        var msg = (err && err.message) || '预下单失败'
        if (msg.indexOf('微信授权') >= 0 || msg.indexOf('wx-bind') >= 0) {
          self._bindWxThen(startPay)
          return
        }
        wx.showToast({ title: msg, icon: 'none' })
      })
    }

    startPay()
  },

  closeMembershipModal: function () {
    this.setData({ membershipModal: null, membershipOrder: null })
  },

  onShareAppMessage: function () {
    var MY = this.data.MY || {}
    if (this.data.shareMode === 'card') {
      var shareCode = this.data.shareCode || ''
      return {
        title: (MY.name || '我') + ' · 企盟数字名片',
        path: shareCode 
          ? '/pages/login/login?shareCode=' + shareCode 
          : '/pages/contacts/contacts?userId=' + (MY.id || '')
      }
    }
    if (this.data.shareMode === 'invite') {
      var inviteCode = this.data.inviteCode || MY.inviteCode || ''
      return {
        title: (MY.name || '好友') + ' 邀请你加入企盟',
        path: inviteCode ? '/pages/login/login?ref=' + inviteCode : '/pages/login/login'
      }
    }
    return {
      title: '企盟',
      path: '/pages/login/login'
    }
  }
})
