function strOk(v) {
  return !!(v && String(v).trim())
}

function buildProfileSnapshot(user, card) {
  card = card || {}
  var job = (card.job_title || '').trim()
  var region = (card.region || '').trim()
  var headline = job
  if (job && region) headline = job + ' · ' + region
  else if (region) headline = region
  return {
    headline: headline,
    industryText: (card.industry || '').trim()
  }
}

function isProfileGuideNeeded(user, card) {
  if (!user) return false
  var profile = buildProfileSnapshot(user, card)
  return !(strOk(user.name) && strOk(profile.headline) && strOk(profile.industryText))
}

var GUIDE_STEPS = [
  {
    title: '欢迎来到企盟',
    desc: 'AIGC 时代的「超级个体网络」—— 让每个人的人脉、能力、资源都能流动起来，变成可复制的数字资产。',
    icon: 'card'
  },
  {
    title: '打造你的数字名片',
    desc: '完善姓名、职务、行业等信息，在通讯录中展示专业形象，让他人快速了解你能提供的价值。',
    icon: 'card'
  },
  {
    title: '拓展真实人脉',
    desc: '浏览成员、添加好友、互换名片，基于靠谱度与信用体系建立可信赖的协作关系。',
    icon: 'network'
  },
  {
    title: '任务与活动协作',
    desc: '发布或报名任务、活动，把资源与需求对接起来，让合作在企盟内自然发生。',
    icon: 'task'
  },
  {
    title: '完善资料，解锁全部功能',
    desc: '完成实名与名片资料后，即可分享名片、查看任务列表、报名活动等核心能力。',
    icon: 'unlock'
  }
]

function maybeSetShowGuide(user, card) {
  if (isProfileGuideNeeded(user, card)) {
    wx.setStorageSync('qm_show_guide', true)
  }
}

function setShowGuideAfterRegister() {
  wx.setStorageSync('qm_show_guide', true)
  wx.removeStorageSync('qm_guide_shown')
}

function computeCompleteness(user, card, extras) {
  extras = extras || {}
  card = card || {}
  var fields = [
    user && user.name,
    card.job_title || extras.job,
    card.company || extras.co,
    card.region || extras.city,
    card.industry || extras.industry,
    card.bio || extras.personalValue,
    user && user.phone
  ]
  var filled = 0
  for (var i = 0; i < fields.length; i++) {
    if (strOk(fields[i])) filled++
  }
  return Math.round((filled / 7) * 100)
}

function pcFillClass(pct) {
  var n = Number(pct) || 0
  if (n >= 67) return 'pc-fill-green'
  if (n >= 34) return 'pc-fill-yellow'
  return 'pc-fill-red'
}

function computeFieldMissing(form) {
  form = form || {}
  var bizmap = form.bizmap || []
  var bizmapRows = bizmap.map(function (b) {
    b = b || {}
    var hasAny = strOk(b.industry) || strOk(b.role) || strOk(b.biz)
    if (!hasAny) {
      return { active: false, industry: false, role: false, biz: false }
    }
    return {
      active: true,
      industry: !strOk(b.industry),
      role: !strOk(b.role),
      biz: !strOk(b.biz)
    }
  })
  var hasActiveBizmap = bizmapRows.some(function (r) { return r.active })
  return {
    name: !strOk(form.name),
    job: !strOk(form.job),
    co: !strOk(form.co),
    city: !strOk(form.city),
    industry: !strOk(form.industry),
    email: !strOk(form.email),
    personalValue: !strOk(form.personalValue),
    talentsText: !strOk(form.talentsText),
    resourcesText: !strOk(form.resourcesText),
    needsText: !strOk(form.needsText),
    roles: !(form.roles && form.roles.length),
    honorsText: !strOk(form.honorsText),
    bizmap: !hasActiveBizmap,
    bizmapRows: bizmapRows
  }
}

function syncProfileHint(user, card) {
  var incomplete = isProfileGuideNeeded(user, card)
  try {
    var app = getApp()
    if (app && app.globalData) {
      app.globalData.profileIncomplete = incomplete
    }
  } catch (e) {}
  return incomplete
}

module.exports = {
  GUIDE_STEPS: GUIDE_STEPS,
  buildProfileSnapshot: buildProfileSnapshot,
  isProfileGuideNeeded: isProfileGuideNeeded,
  syncProfileHint: syncProfileHint,
  computeFieldMissing: computeFieldMissing,
  maybeSetShowGuide: maybeSetShowGuide,
  setShowGuideAfterRegister: setShowGuideAfterRegister,
  computeCompleteness: computeCompleteness,
  pcFillClass: pcFillClass
}
