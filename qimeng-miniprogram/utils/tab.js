/** 安全更新自定义 tabBar */
function setTab(page, index, extra) {
  if (!page || typeof page.getTabBar !== 'function') return
  var bar = page.getTabBar()
  if (!bar || typeof bar.setData !== 'function') return
  extra = extra || {}
  if (extra.hasProfileIncomplete === undefined) {
    try {
      var app = getApp()
      extra.hasProfileIncomplete = !!(app.globalData && app.globalData.profileIncomplete)
    } catch (e) {
      extra.hasProfileIncomplete = false
    }
  }
  var data = { selected: index }
  for (var k in extra) {
    if (extra.hasOwnProperty(k)) data[k] = extra[k]
  }
  bar.setData(data)
}

module.exports = { setTab: setTab }
