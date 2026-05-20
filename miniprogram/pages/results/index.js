const { request, getAdminHeader, getAdminSession } = require("../../utils/api");

Page({
  data: {
    activityId: "demo-activity",
    records: [],
  },

  onLoad(options) {
    const activityId = options.activityId || getApp().globalData.activityId || "demo-activity";
    if (!getAdminSession()) {
      wx.showToast({ title: "请先管理员登录", icon: "none" });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/register/index?activityId=${encodeURIComponent(activityId)}`,
        });
      }, 600);
      return;
    }
    this.setData({ activityId });
  },

  onShow() {
    if (getAdminSession()) {
      this.loadResults();
    }
  },

  async loadResults() {
    try {
      const result = await request({
        path: `/api/mini/results?activityId=${encodeURIComponent(this.data.activityId)}`,
        header: getAdminHeader(),
      });
      this.setData({ records: result.results || [] });
    } catch (error) {
      wx.showToast({ title: error.error || "结果加载失败", icon: "none" });
    }
  },

  exportResults() {
    wx.showToast({ title: "结果导出稍后恢复", icon: "none" });
  },
});
