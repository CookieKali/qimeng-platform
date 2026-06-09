var apiModule = require('../../utils/api');
var layout = require('../../utils/layout');
var api = apiModule.api;

function formatDateTime(iso) {
  if (!iso) return '';
  var raw = String(iso);
  var d = new Date(raw.indexOf('T') === -1 ? raw.replace(' ', 'T') : raw);
  if (isNaN(d.getTime())) return raw;
  var y = d.getFullYear();
  var m = (d.getMonth() + 1) < 10 ? '0' + (d.getMonth() + 1) : (d.getMonth() + 1);
  var day = d.getDate() < 10 ? '0' + d.getDate() : d.getDate();
  var hh = d.getHours() < 10 ? '0' + d.getHours() : d.getHours();
  var mm = d.getMinutes() < 10 ? '0' + d.getMinutes() : d.getMinutes();
  return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
}

function getAuditStatusText(status) {
  var map = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已拒绝'
  };
  return map[status] || status;
}

function getAuditStatusClass(status) {
  var map = {
    'pending': 'audit-pending',
    'approved': 'audit-approved',
    'rejected': 'audit-rejected'
  };
  return map[status] || '';
}

Page({
  data: {
    headerHeight: 64,
    pageBottom: 62,
    filterStatus: '',
    filterAuditStatus: '',
    bookings: [],
    loading: true,
    selectedBooking: null,
    rejectReason: '',
    showDetailModal: false,
    showRejectModal: false
  },

  onLoad: function () {
    this.setData(Object.assign({}, layout.getPageInsets()));
  },

  onShow: function () {
    this._loadBookings();
  },

  onPullDownRefresh: function () {
    var self = this;
    this._loadBookings().then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  _loadBookings: function () {
    var self = this;
    this.setData({ loading: true });
    var params = {};
    if (this.data.filterStatus) params.status = this.data.filterStatus;
    if (this.data.filterAuditStatus) params.audit_status = this.data.filterAuditStatus;

    return api.admin.bookings(params).then(function (data) {
      var enriched = (data.items || []).map(function (b) {
        return Object.assign({}, b, {
          auditStatusText: getAuditStatusText(b.audit_status),
          auditStatusClass: getAuditStatusClass(b.audit_status),
          startDateTime: formatDateTime(b.start_time),
          endDateTime: formatDateTime(b.end_time),
          createdAt: formatDateTime(b.created_at)
        });
      });
      self.setData({ bookings: enriched, loading: false });
    }).catch(function (err) {
      self.setData({ loading: false, bookings: [] });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  },

  onStatusFilter: function (e) {
    var val = e.currentTarget.dataset.value;
    this.setData({ filterStatus: val === this.data.filterStatus ? '' : val }, function () {
      this._loadBookings();
    });
  },

  onAuditFilter: function (e) {
    var val = e.currentTarget.dataset.value;
    this.setData({ filterAuditStatus: val === this.data.filterAuditStatus ? '' : val }, function () {
      this._loadBookings();
    });
  },

  openBookingDetail: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10);
    if (!id) return;
    var self = this;
    wx.showLoading({ title: '加载中...' });
    api.admin.bookingDetail(id).then(function (data) {
      wx.hideLoading();
      var booking = data;
      booking.auditStatusText = getAuditStatusText(booking.audit_status);
      booking.auditStatusClass = getAuditStatusClass(booking.audit_status);
      booking.startDateTime = formatDateTime(booking.start_time);
      booking.endDateTime = formatDateTime(booking.end_time);
      booking.createdAt = formatDateTime(booking.created_at);
      self.setData({ selectedBooking: booking, showDetailModal: true, rejectReason: '' });
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  },

  approveBooking: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10);
    if (!id) return;
    var self = this;
    wx.showModal({
      title: '审核通过',
      content: '确定要通过这个预约吗？',
      success: function (res) {
        if (!res.confirm) return;
        self._doAudit(id, 'approved', '');
      }
    });
  },

  openRejectModal: function (e) {
    var id = parseInt(e.currentTarget.dataset.id, 10);
    if (!id) return;
    var booking = this.data.bookings.find(function (b) { return b.id === id; }) || this.data.selectedBooking;
    this.setData({ selectedBooking: booking, rejectReason: '', showRejectModal: true, showDetailModal: false });
  },

  onRejectReasonInput: function (e) {
    this.setData({ rejectReason: e.detail.value });
  },

  confirmReject: function () {
    var id = this.data.selectedBooking && this.data.selectedBooking.id;
    if (!id) return;
    if (!this.data.rejectReason.trim()) {
      wx.showToast({ title: '请输入拒绝原因', icon: 'none' });
      return;
    }
    this._doAudit(id, 'rejected', this.data.rejectReason.trim());
  },

  _doAudit: function (id, auditStatus, rejectReason) {
    var self = this;
    wx.showLoading({ title: '处理中...' });
    api.admin.auditBooking(id, {
      audit_status: auditStatus,
      reject_reason: rejectReason
    }).then(function () {
      wx.hideLoading();
      self.setData({ showDetailModal: false, showRejectModal: false });
      wx.showToast({ title: '操作成功', icon: 'success' });
      self._loadBookings();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  closeModal: function () {
    this.setData({ showDetailModal: false, showRejectModal: false });
  },

  stopProp: function () {}
});
