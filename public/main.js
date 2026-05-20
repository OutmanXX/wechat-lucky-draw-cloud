const API_BASE = "https://express-914c-257494-7-1432860142.sh.run.tcloudbase.com";
const ACTIVITY_ID = "demo-activity";

const loginPanel = document.getElementById("login-panel");
const adminPanel = document.getElementById("admin-panel");
const loginBtn = document.getElementById("login-btn");
const loginMessage = document.getElementById("login-message");
const logoutBtn = document.getElementById("logout-btn");
const activityForm = document.getElementById("activity-form");
const activityMessage = document.getElementById("activity-message");
const resetBtn = document.getElementById("reset-btn");
const addPrizeBtn = document.getElementById("add-prize-btn");
const prizeConfigs = document.getElementById("prize-configs");
const stats = document.getElementById("stats");
const participants = document.getElementById("participants");
const drawForm = document.getElementById("draw-form");
const drawToggleBtn = document.getElementById("draw-toggle-btn");
const drawCandidates = document.getElementById("draw-candidates");
const drawWinners = document.getElementById("draw-winners");
const resultsList = document.getElementById("results-list");
const exportLink = document.getElementById("export-link");

let adminToken = localStorage.getItem("admin_token") || "";
let activeDrawRecordId = "";
let rolling = false;
let rollingTimer = null;
let cachedCandidates = [];

document.querySelectorAll(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
activityForm.addEventListener("submit", saveActivity);
resetBtn.addEventListener("click", resetActivity);
addPrizeBtn.addEventListener("click", () => appendPrizeConfig());
drawForm.addEventListener("submit", toggleDraw);

if (adminToken) {
  showAdmin();
  loadAll().catch(handleLoadError);
} else {
  showLogin();
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}

async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

  try {
    const result = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: { "Content-Type": "application/json" },
      skipAuth: true,
    });

    adminToken = result.token;
    localStorage.setItem("admin_token", adminToken);
    loginMessage.textContent = "";
    showAdmin();
    await loadAll();
  } catch (error) {
    loginMessage.textContent = error.error || "登录失败";
  }
}

function logout() {
  localStorage.removeItem("admin_token");
  adminToken = "";
  showLogin();
}

async function loadAll() {
  await loadOverview();
  await loadCandidates();
  await loadResults();
}

async function loadOverview() {
  const result = await apiRequest(`/api/admin/overview?activityId=${encodeURIComponent(ACTIVITY_ID)}`);

  document.body.style.backgroundImage = result.activity.registerBgUrl
    ? `linear-gradient(135deg, rgba(251,244,236,0.92), rgba(236,246,239,0.92)), url("${result.activity.registerBgUrl}")`
    : "";

  document.getElementById("activity-id").value = ACTIVITY_ID;
  document.getElementById("activity-name").value = result.activity.name;
  document.getElementById("register-bg-url").value = result.activity.registerBgUrl;
  document.getElementById("draw-title").value = result.activity.drawTitle;
  exportLink.href = `${API_BASE}/api/results/export?activityId=${encodeURIComponent(ACTIVITY_ID)}`;

  renderPrizeConfigs(result.activity.prizeConfigs || []);
  renderStats(result.stats);
  renderParticipants(result.participants || []);
}

function renderStats(data) {
  stats.innerHTML = `
    <article class="stat-card"><span>已登记总人数</span><strong>${data.totalParticipants}</strong></article>
    <article class="stat-card"><span>未中奖候选人</span><strong>${data.pendingParticipants}</strong></article>
    <article class="stat-card"><span>已中奖人数</span><strong>${data.totalWinners}</strong></article>
    <article class="stat-card"><span>已抽奖次数</span><strong>${data.totalDraws}</strong></article>
  `;
}

function renderParticipants(list) {
  participants.innerHTML = list.length
    ? list
        .map(
          (item) => `
            <article class="card participant-card">
              <img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.nickname)}" />
              <div>
                <strong>${escapeHtml(item.nickname)}</strong>
                <p>${escapeHtml(item.openid)}</p>
                <p>${item.wins.length ? item.wins.map((win) => win.title).join("、") : "未中奖"}</p>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="card muted">当前还没有登记用户。</div>`;
}

function renderPrizeConfigs(configs) {
  prizeConfigs.innerHTML = "";
  configs.forEach((config) => appendPrizeConfig(config));
}

function appendPrizeConfig(config = {}) {
  const item = document.createElement("div");
  item.className = "prize-row";
  item.innerHTML = `
    <input class="prize-name" placeholder="奖项名称" value="${escapeHtml(config.name || "")}" />
    <input class="prize-count" type="number" min="1" value="${config.count || 1}" />
    <button class="ghost-btn small-btn" type="button">删除</button>
  `;
  item.querySelector("button").addEventListener("click", () => item.remove());
  prizeConfigs.appendChild(item);
}

async function saveActivity(event) {
  event.preventDefault();

  const payload = {
    activityId: ACTIVITY_ID,
    name: document.getElementById("activity-name").value.trim(),
    registerBgUrl: document.getElementById("register-bg-url").value.trim(),
    drawTitle: document.getElementById("draw-title").value.trim(),
    prizeConfigs: Array.from(document.querySelectorAll(".prize-row")).map((row, index) => ({
      name: row.querySelector(".prize-name").value.trim(),
      count: Number(row.querySelector(".prize-count").value || 1),
      sortOrder: index + 1,
    })),
  };

  try {
    await apiRequest("/api/admin/activity", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    activityMessage.textContent = "管理设置已保存";
    await loadOverview();
  } catch (error) {
    activityMessage.textContent = error.error || "保存失败";
  }
}

async function resetActivity() {
  if (!window.confirm("确认清空登记、奖项记录和中奖结果，并恢复默认配置吗？")) {
    return;
  }

  try {
    await apiRequest("/api/admin/reset", {
      method: "POST",
      body: JSON.stringify({ activityId: ACTIVITY_ID }),
      headers: { "Content-Type": "application/json" },
    });

    activeDrawRecordId = "";
    rolling = false;
    stopRollingAnimation();
    drawWinners.innerHTML = "";
    activityMessage.textContent = "已完成初始化清空";
    await loadAll();
  } catch (error) {
    activityMessage.textContent = error.error || "清空失败";
  }
}

async function loadCandidates() {
  const result = await apiRequest(
    `/api/admin/draw/candidates?activityId=${encodeURIComponent(ACTIVITY_ID)}`,
  );
  cachedCandidates = result.candidates || [];
  renderCandidateCards(cachedCandidates);
}

function renderCandidateCards(list) {
  drawCandidates.innerHTML = list.length
    ? list
        .map(
          (item) => `
            <article class="card participant-card">
              <img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.nickname)}" />
              <div>
                <strong>${escapeHtml(item.nickname)}</strong>
                <p>${escapeHtml(item.openid)}</p>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="card muted">当前没有可抽奖候选人。</div>`;
}

async function toggleDraw(event) {
  event.preventDefault();
  if (rolling) {
    await stopDraw();
    return;
  }
  await startDraw();
}

async function startDraw() {
  const prizeName = document.getElementById("draw-prize-name").value.trim();
  const drawCount = Number(document.getElementById("draw-count").value || 1);

  if (!prizeName) {
    alert("请先填写奖项名称");
    return;
  }

  const result = await apiRequest("/api/admin/draw/start", {
    method: "POST",
    body: JSON.stringify({ activityId: ACTIVITY_ID, prizeName, drawCount }),
    headers: { "Content-Type": "application/json" },
  });

  activeDrawRecordId = result.drawRecord.id;
  rolling = true;
  drawToggleBtn.textContent = "停止抽奖";
  drawWinners.innerHTML = `<div class="card muted">正在滚动抽奖中...</div>`;
  startRollingAnimation(drawCount);
}

async function stopDraw() {
  if (!activeDrawRecordId) {
    return;
  }

  const result = await apiRequest("/api/admin/draw/stop", {
    method: "POST",
    body: JSON.stringify({ drawRecordId: activeDrawRecordId }),
    headers: { "Content-Type": "application/json" },
  });

  rolling = false;
  drawToggleBtn.textContent = "开始抽奖";
  stopRollingAnimation();
  renderWinnerCards(result.drawRecord.title, result.winners);
  await loadAll();
}

function startRollingAnimation(drawCount) {
  stopRollingAnimation();
  rollingTimer = window.setInterval(() => {
    const shuffled = [...cachedCandidates].sort(() => Math.random() - 0.5);
    renderWinnerCards("滚动候选", shuffled.slice(0, Math.max(1, drawCount)));
  }, 120);
}

function stopRollingAnimation() {
  if (rollingTimer) {
    window.clearInterval(rollingTimer);
    rollingTimer = null;
  }
}

function renderWinnerCards(title, winners) {
  drawWinners.innerHTML = winners.length
    ? winners
        .map(
          (item, index) => `
            <article class="card winner-card">
              <img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.nickname)}" />
              <div>
                <strong>${escapeHtml(item.nickname)}</strong>
                <p>${escapeHtml(title)} · 第 ${item.prizeOrder || index + 1} 位</p>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="card muted">当前没有抽出的中奖人。</div>`;
}

async function loadResults() {
  const result = await apiRequest(`/api/admin/results?activityId=${encodeURIComponent(ACTIVITY_ID)}`);

  resultsList.innerHTML = result.grouped.length
    ? result.grouped
        .map(
          (group) => `
            <section class="card result-group">
              <h3>${escapeHtml(group.title)}</h3>
              ${
                group.winners.length
                  ? group.winners
                      .map(
                        (winner) => `
                          <div class="participant-card result-row">
                            <img src="${escapeHtml(winner.avatarUrl)}" alt="${escapeHtml(winner.nickname)}" />
                            <div>
                              <strong>${escapeHtml(winner.nickname)}</strong>
                              <p>${escapeHtml(winner.openid)}</p>
                            </div>
                          </div>
                        `,
                      )
                      .join("")
                  : `<p class="muted">该奖项还没有中奖记录。</p>`
              }
            </section>
          `,
        )
        .join("")
    : `<div class="card muted">当前还没有中奖记录。</div>`;
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

async function apiRequest(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (!options.skipAuth && adminToken) {
    headers["x-admin-token"] = adminToken;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw data;
  }
  return data;
}

function handleLoadError(error) {
  console.error(error);
  activityMessage.textContent = error.error || "数据加载失败";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
