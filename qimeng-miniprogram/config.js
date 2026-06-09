/** API 地址：模拟器优先 localhost（macOS 微信工具对 127.0.0.1 常报 ERR_ADDRESS_INVALID）；真机用 config.local.js */
var DEV_LOCAL = 'http://localhost:8000'

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

  var lan = readLocalConfig()

  if (isDevtools()) {
    // 模拟器固定 localhost，避免 WiFi/网卡切换导致 ERR_NETWORK_CHANGED
    // 真机预览请用「预览」扫码；局域网地址见 config.local.js（由 sync_api_host.sh 生成）
    return DEV_LOCAL
  }

  if (lan) return lan
  return DEV_LOCAL
}

module.exports = {
  DEV_LOCAL: DEV_LOCAL,
  resolveApiBase: resolveApiBase,
  isDevtools: isDevtools
}
