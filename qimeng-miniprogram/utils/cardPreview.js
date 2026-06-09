var config = require('../config')

var ROLE_LABELS = {
  partner: '创始合伙人',
  paid: '企业主',
  investor: '投资人',
  sales: '销售',
  expert: '专家',
  mentor: '专家',
  station_admin: '合伙人',
  super_admin: '创始合伙人',
  normal: '成员'
}

function buildCardPreview(opts) {
  opts = opts || {}
  var MY = opts.MY || {}
  var mp = opts.myProfile || {}
  var myAv = opts.myAv || {}
  var roles = opts.myRoles || []
  var job = MY.job || ''
  var co = MY.co || ''
  var headline = ''
  if (job && co) headline = job + ' · ' + co
  else if (job) headline = job
  else if (co) headline = co

  return {
    name: MY.name || '未设置姓名',
    nameAbbr: MY.nameAbbr || (MY.name || '').slice(0, 2),
    headline: headline,
    roleLabel: roles[0] || ROLE_LABELS[MY.role] || '成员',
    creditLabel: '靠谱度 ' + (MY.creditLv || 'A'),
    personalValue: mp.personalValue || '',
    industryText: MY.industry || '',
    resourcesText: mp.resourcesText || '',
    needsText: mp.needsText || '',
    avatarUrl: myAv.imgUrl || '',
    avatarBg: myAv.bg || '#0c1e38',
    avatarC: myAv.c || '#5cb8ff',
    userId: MY.id || 0,
    qrCodeUrl: MY.id ? (config.resolveApiBase() + '/api/v1/users/' + MY.id + '/qrcode') : ''
  }
}

module.exports = {
  buildCardPreview: buildCardPreview
}
