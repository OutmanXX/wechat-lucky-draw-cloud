const { request, login, readFileAsDataUrl } = require("../../utils/api");

Page({
  data: {
    activityId: "demo-activity",
    activity: null,
    nickname: "",
    avatarUrl: "",
    backgroundStyle: "",
    loading: false,
  },

  onLoad(options) {
    const app = getApp();
    const scene = options.scene ? decodeURIComponent(options.scene) : "";
    const activityId = options.activityId || scene || app.globalData.activityId || "demo-activity";
    app.globalData.activityId = activityId;
    this.setData({ activityId });
    this.loadActivity();
  },

  async loadActivity() {
    try {
      const result = await request({
        path: `/api/mini/activity?activityId=${encodeURIComponent(this.data.activityId)}`,
      });
      const style = result.activity.registerBgUrl
        ? `background-image:url('${result.activity.registerBgUrl}');`
        : "";
      this.setData({
        activity: result.activity,
        backgroundStyle: style,
      });
      wx.setNavigationBarTitle({ title: result.activity.name });
    } catch (error) {
      console.error("loadActivity failed", error);
      wx.showToast({ title: error.error || "加载活动失败", icon: "none" });
    }
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value });
  },

  async onChooseAvatar(event) {
    try {
      const avatarUrl = await readFileAsDataUrl(event.detail.avatarUrl);
      this.setData({ avatarUrl });
    } catch (error) {
      console.error("chooseAvatar failed", error);
      wx.showToast({ title: error.error || "头像读取失败", icon: "none" });
    }
  },

  async submitRegister() {
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }
    if (!this.data.avatarUrl) {
      wx.showToast({ title: "请先选择头像", icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      const loginResult = await login();
      const result = await request({
        path: "/api/mini/register",
        method: "POST",
        data: {
          activityId: this.data.activityId,
          code: loginResult.code,
          nickname: this.data.nickname.trim(),
          avatarDataUrl: this.data.avatarUrl,
        },
      });
      getApp().globalData.session = result.registration;
      wx.showToast({ title: "登记成功", icon: "success" });
    } catch (error) {
      console.error("submitRegister failed", error);
      wx.showToast({
        title: error.error || error.message || "登记失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
