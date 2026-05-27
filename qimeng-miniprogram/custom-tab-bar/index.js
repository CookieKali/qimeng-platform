Component({
  data: {
    selected: 0,
    hasPending: false,
    tabs: [
      { url: '/pages/contacts/contacts', label: '通讯录', sym: '📇' },
      { url: '/pages/tasks/tasks', label: '任务&活动', sym: '📋' },
      { url: '/pages/profile/profile', label: '我的', sym: '👤' }
    ]
  },
  methods: {
    switchTab: function (e) {
      var idx = parseInt(e.currentTarget.dataset.index, 10)
      var tab = this.data.tabs[idx]
      if (!tab) return
      wx.switchTab({ url: tab.url })
      this.setData({ selected: idx })
    }
  }
})
