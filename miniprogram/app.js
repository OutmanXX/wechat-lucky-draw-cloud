App({
  onLaunch() {
    wx.cloud.init({
      env: "prod-d7gsk63mfd883e0b4",
      traceUser: true,
    });
    this.globalData.adminSession = wx.getStorageSync("admin_session") || null;
  },
  globalData: {
    activityId: "demo-activity",
    session: null,
    adminSession: null,
  },
});
