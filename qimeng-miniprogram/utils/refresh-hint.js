/** 标记通讯录需刷新消息/申请角标（从消息页、聊天页返回时） */
function markContactsInboxDirty() {
  var app = getApp()
  if (app && app.globalData) {
    app.globalData.contactsNeedRefresh = true
  }
}

module.exports = {
  markContactsInboxDirty: markContactsInboxDirty
}
