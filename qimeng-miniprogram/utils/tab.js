/** 安全更新自定义 tabBar */
function setTab(page, index, extra) {
  if (!page || typeof page.getTabBar !== 'function') return
  var bar = page.getTabBar()
  if (!bar || typeof bar.setData !== 'function') return
  var data = { selected: index }
  if (extra) {
    for (var k in extra) {
      if (extra.hasOwnProperty(k)) data[k] = extra[k]
    }
  }
  bar.setData(data)
}

module.exports = { setTab: setTab }
