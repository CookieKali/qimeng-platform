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

function maybeSetShowGuide(user, card) {
  if (isProfileGuideNeeded(user, card)) {
    wx.setStorageSync('qm_show_guide', true)
  }
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

module.exports = {
  buildProfileSnapshot: buildProfileSnapshot,
  isProfileGuideNeeded: isProfileGuideNeeded,
  maybeSetShowGuide: maybeSetShowGuide,
  computeCompleteness: computeCompleteness,
  pcFillClass: pcFillClass
}
