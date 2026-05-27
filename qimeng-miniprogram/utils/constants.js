/** Shared enums for miniprogram (single source of truth) */

var INDUSTRIES = [
  '互联网/软件',
  '新能源/储能',
  '零售/电商',
  '金融/投资',
  '法律/咨询',
  '食品/餐饮',
  '医疗/健康',
  '制造业',
  '教育/培训',
  '文化/传媒',
  '房地产/建筑',
  '物流/供应链',
  '农业/农技',
  '汽车/出行',
  '消费/品牌',
  '政府/国企',
  '跨境贸易',
  '人工智能',
  '游戏/娱乐',
  '其他'
]

var REGIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '重庆',
  '杭州',
  '武汉',
  '苏州',
  '南京',
  '南宁',
  '厦门',
  '青岛',
  '天津',
  '西安'
]

/** Map new enum -> legacy DB values for list API exact match */
var INDUSTRY_API_VALUE = {
  '互联网/软件': '互联网',
  '新能源/储能': '新能源',
  '零售/电商': '零售',
  '金融/投资': '金融',
  '法律/咨询': '法律',
  '食品/餐饮': '食品',
  '医疗/健康': '医疗',
  '教育/培训': '教育'
}

/** Map legacy stored value -> picker index industry */
var INDUSTRY_LEGACY_TO_ENUM = {
  '互联网': '互联网/软件',
  '新能源': '新能源/储能',
  '零售': '零售/电商',
  '金融': '金融/投资',
  '法律': '法律/咨询',
  '食品': '食品/餐饮',
  '医疗': '医疗/健康',
  '教育': '教育/培训'
}

function normalizeIndustry(value) {
  if (!value) return ''
  if (INDUSTRIES.indexOf(value) >= 0) return value
  return INDUSTRY_LEGACY_TO_ENUM[value] || value
}

function industryForApi(selected) {
  if (!selected || selected === '全部') return '全部'
  return INDUSTRY_API_VALUE[selected] || selected
}

function industryPickerIndex(value) {
  var normalized = normalizeIndustry(value)
  var idx = INDUSTRIES.indexOf(normalized)
  if (idx >= 0) return idx
  return INDUSTRIES.indexOf('其他')
}

module.exports = {
  INDUSTRIES: INDUSTRIES,
  REGIONS: REGIONS,
  INDUSTRY_API_VALUE: INDUSTRY_API_VALUE,
  INDUSTRY_LEGACY_TO_ENUM: INDUSTRY_LEGACY_TO_ENUM,
  normalizeIndustry: normalizeIndustry,
  industryForApi: industryForApi,
  industryPickerIndex: industryPickerIndex
}
