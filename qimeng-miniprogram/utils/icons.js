/**
 * Symbol icons (emoji / Unicode) — reliable on WeChat without custom font.
 * Keys match former iconfont class names (icon-xxx or xxx).
 */
var SYM = {
  user: '👤',
  contacts: '📇',
  task: '📝',
  'task-list': '📋',
  search: '🔍',
  mail: '✉️',
  phone: '📞',
  lock: '🔒',
  friends: '👥',
  recommend: '⭐',
  notification: '🔔',
  activity: '📅',
  community: '🏢',
  calendar: '📅',
  pending: '👤',
  spaces: '🏛️',
  profit: '💰',
  wallet: '💳',
  invite: '➕'
}

var INBOX_TYPE_SYM = {
  friend_request: '👥',
  recommendation: '⭐',
  card_share: '📇',
  system: '🔔',
  task_notify: '📋',
  activity_notify: '📅',
  task_share: '📋',
  activity_share: '📅'
}

function sym(name) {
  if (!name) return '•'
  var key = String(name).replace(/^icon-/, '')
  if (SYM[key]) return SYM[key]
  if (INBOX_TYPE_SYM[key]) return INBOX_TYPE_SYM[key]
  return '•'
}

module.exports = {
  SYM: SYM,
  sym: sym,
  inboxSym: function (type) {
    return INBOX_TYPE_SYM[type] || '🔔'
  }
}
