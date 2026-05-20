const { request, getAdminSession, getAdminHeader } = require("../../utils/api");

let rollingTimer = null;

Page({
  data: {
    activityId: "demo-activity",
    title: "一等奖",
    drawCount: 1,
    rolling: false,
    candidates: [],
    rollingDisplay: [],
    winners: [],
    currentDrawId: "",
  },

  onLoad(options) {
    const activityId = options.activityId || getApp().globalData.activityId || "demo-activity";
    const adminSession = getAdminSession();
    if (!adminSession) {
      wx.showToast({ title: "请先管理员登录", icon: "none" });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/register/index?activityId=${encodeURIComponent(activityId)}`,
        });
      }, 600);
      return;
    }

    this.setData({ activityId });
    this.loadCandidates();
  },

  onUnload() {
    this.stopRollingAnimation();
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onCountInput(event) {
    this.setData({ drawCount: Number(event.detail.value || 1) });
  },

  async loadCandidates() {
    try {
      const result = await request({
        path: `/api/draw/candidates?activityId=${encodeURIComponent(this.data.activityId)}`,
        header: getAdminHeader(),
      });
      this.setData({ candidates: result.candidates });
      if (!this.data.rollingDisplay.length) {
        this.setData({ rollingDisplay: result.candidates.slice(0, 6) });
      }
    } catch (error) {
      wx.showToast({ title: error.error || "候选名单加载失败", icon: "none" });
    }
  },

  async toggleDraw() {
    if (this.data.rolling) {
      await this.stopDraw();
      return;
    }
    await this.startDraw();
  },

  async startDraw() {
    if (!this.data.candidates.length) {
      wx.showToast({ title: "暂无可抽奖名单", icon: "none" });
      return;
    }

    try {
      const result = await request({
        path: "/api/draw/start",
        method: "POST",
        header: getAdminHeader(),
        data: {
          activityId: this.data.activityId,
          title: this.data.title || "幸运抽奖",
          drawCount: Math.max(1, this.data.drawCount),
        },
      });

      this.setData({
        rolling: true,
        winners: [],
        currentDrawId: result.drawRecord.id,
      });
      this.startRollingAnimation();
    } catch (error) {
      wx.showToast({ title: error.error || "开始抽奖失败", icon: "none" });
    }
  },

  async stopDraw() {
    this.stopRollingAnimation();
    try {
      const result = await request({
        path: "/api/draw/stop",
        method: "POST",
        header: getAdminHeader(),
        data: {
          drawRecordId: this.data.currentDrawId,
        },
      });
      this.setData({
        rolling: false,
        winners: result.winners,
        rollingDisplay: result.winners,
      });
      await this.loadCandidates();
    } catch (error) {
      this.setData({ rolling: false });
      wx.showToast({ title: error.error || "停止抽奖失败", icon: "none" });
    }
  },

  startRollingAnimation() {
    this.stopRollingAnimation();
    rollingTimer = setInterval(() => {
      const shuffled = [...this.data.candidates];
      shuffled.sort(() => Math.random() - 0.5);
      this.setData({
        rollingDisplay: shuffled.slice(0, Math.max(1, this.data.drawCount)),
      });
    }, 120);
  },

  stopRollingAnimation() {
    if (rollingTimer) {
      clearInterval(rollingTimer);
      rollingTimer = null;
    }
  },
});
