/** 安全区尺寸（兼容 3.5 / 3.16 基础库） */
function getSystemInfo() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      return wx.getWindowInfo()
    }
  } catch (e1) {}
  try {
    return wx.getSystemInfoSync()
  } catch (e2) {}
  return { statusBarHeight: 20, screenHeight: 800, safeArea: { bottom: 800 } }
}

function initAppLayout(app) {
  if (!app || !app.globalData) return

  var statusBarHeight = 20
  var headerHeight = 64
  var safeBottom = 0

  try {
    var sys = getSystemInfo()
    statusBarHeight = sys.statusBarHeight || 20
    headerHeight = statusBarHeight + 44
    if (sys.safeArea && sys.screenHeight) {
      safeBottom = Math.max(0, sys.screenHeight - sys.safeArea.bottom)
    }
  } catch (e) {}

  try {
    var menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.bottom) {
      headerHeight = menu.bottom + 10
    }
  } catch (e) {}

  var pageBottom = 56 + safeBottom + 6

  app.globalData.statusBarHeight = statusBarHeight
  app.globalData.headerHeight = headerHeight
  app.globalData.tabBarHeight = 56
  app.globalData.safeBottom = safeBottom
  app.globalData.pageBottom = pageBottom
}

function getPageInsets() {
  try {
    var app = getApp()
    if (app && app.globalData) {
      return {
        statusBarHeight: app.globalData.statusBarHeight || 20,
        headerHeight: app.globalData.headerHeight || 64,
        pageBottom: app.globalData.pageBottom || 62
      }
    }
  } catch (e) {}
  return { statusBarHeight: 20, headerHeight: 64, pageBottom: 62 }
}

module.exports = {
  initAppLayout: initAppLayout,
  getPageInsets: getPageInsets
}
