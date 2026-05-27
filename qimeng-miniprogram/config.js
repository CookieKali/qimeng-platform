/** API 地址：模拟器用 127.0.0.1；真机用 config.local.js 里的局域网 IP */
var DEV_LOCAL = 'http://127.0.0.1:8000'

function readLocalConfig() {
  try {
    var local = require('./config.local.js')
    if (local && local.apiBase) return local.apiBase
  } catch (e) {}
  return ''
}

function isDevtools() {
  try {
    var sys = wx.getSystemInfoSync()
    return sys.platform === 'devtools'
  } catch (e) {
    return false
  }
}

function resolveApiBase() {
  try {
    var custom = wx.getStorageSync('qm_api_base')
    if (custom) return custom
  } catch (e) {}

  if (isDevtools()) {
    return DEV_LOCAL
  }

  var lan = readLocalConfig()
  if (lan) return lan

  return DEV_LOCAL
}

module.exports = {
  DEV_LOCAL: DEV_LOCAL,
  resolveApiBase: resolveApiBase,
  isDevtools: isDevtools
}
