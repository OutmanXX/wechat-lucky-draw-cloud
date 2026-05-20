const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const cloudbase = require("@cloudbase/node-sdk");

const PORT = Number(process.env.PORT || 3000);
const APP_ID = process.env.WECHAT_APP_ID || "";
const APP_SECRET = process.env.WECHAT_APP_SECRET || "";
const CLOUDBASE_ENV_ID =
  process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || "prod-d7gsk63mfd883e0b4";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gmzx123456";

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const cloudApp = cloudbase.init({ env: CLOUDBASE_ENV_ID });
const db = cloudApp.database();

const COLLECTIONS = {
  activities: "activities",
  participants: "participants",
  drawRecords: "draw_records",
  drawWinners: "draw_winners",
};

const adminTokens = new Map();
const ready = ensureDefaultActivity();

const server = http.createServer(async (req, res) => {
  try {
    await ready;
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }
    serveStatic(res, requestUrl.pathname);
  } catch (error) {
    console.error(error);
    respondJson(res, error.statusCode || 500, {
      error: error.message || "Server error",
      detail: error.detail || "",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Cloud draw backend listening on http://localhost:${PORT}`);
  console.log(`CloudBase env: ${CLOUDBASE_ENV_ID}`);
});

async function handleApi(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await readJsonBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw createHttpError(401, "用户名或密码错误");
    }

    const token = crypto.randomBytes(24).toString("hex");
    adminTokens.set(token, {
      username,
      createdAt: new Date().toISOString(),
    });

    respondJson(res, 200, {
      success: true,
      token,
      user: {
        username,
      },
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/mini/activity") {
    const activityId = searchParams.get("activityId") || "demo-activity";
    const activity = await getActivityById(activityId);
    if (!activity) throw createHttpError(404, "活动不存在");

    respondJson(res, 200, {
      activity,
      stats: await getActivityStats(activityId),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/mini/register") {
    const body = await readJsonBody(req);
    const registration = await registerParticipant(body);
    respondJson(res, 201, { success: true, registration });
    return;
  }

  if (req.method === "GET" && pathname === "/api/activities") {
    respondJson(res, 200, { activities: await listActivities() });
    return;
  }

  requireAdmin(req);

  if (req.method === "GET" && pathname === "/api/admin/overview") {
    const activityId = searchParams.get("activityId") || "demo-activity";
    respondJson(res, 200, {
      activity: await getActivityById(activityId),
      stats: await getActivityStats(activityId),
      participants: await listParticipants(activityId),
      drawRecords: await listDrawRecords(activityId),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/activity") {
    const body = await readJsonBody(req);
    const activity = await saveActivity(body);
    respondJson(res, 200, { success: true, activity });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/reset") {
    const body = await readJsonBody(req);
    const activityId = String(body.activityId || "demo-activity");
    await resetActivity(activityId);
    respondJson(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/draw/candidates") {
    const activityId = searchParams.get("activityId") || "demo-activity";
    respondJson(res, 200, {
      candidates: await listEligibleParticipants(activityId),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/draw/start") {
    const body = await readJsonBody(req);
    const drawRecord = await createDrawRecord(body);
    respondJson(res, 201, { success: true, drawRecord });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/draw/stop") {
    const body = await readJsonBody(req);
    const result = await stopDraw(body.drawRecordId);
    respondJson(res, 200, { success: true, ...result });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/results") {
    const activityId = searchParams.get("activityId") || "demo-activity";
    respondJson(res, 200, {
      activity: await getActivityById(activityId),
      drawRecords: await listDrawRecords(activityId),
      grouped: await getGroupedResults(activityId),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/results/export") {
    const activityId = searchParams.get("activityId") || "demo-activity";
    const csv = await buildResultsCsv(activityId);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${activityId}-results.csv"`,
    });
    res.end(`\uFEFF${csv}`);
    return;
  }

  throw createHttpError(404, "Not found.");
}

function requireAdmin(req) {
  const token = req.headers["x-admin-token"];
  if (!token || !adminTokens.has(token)) {
    throw createHttpError(403, "需要管理员登录");
  }
}

async function ensureDefaultActivity() {
  const existing = await getActivityById("demo-activity");
  if (existing) return;

  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.activities).add({
    data: {
      id: "demo-activity",
      name: "默认演示活动",
      registerBgUrl:
        "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80",
      drawTitle: "幸运抽奖",
      prizeConfigs: defaultPrizeConfigs(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  });
}

function defaultPrizeConfigs() {
  return [
    { name: "一等奖", count: 1, sortOrder: 1 },
    { name: "二等奖", count: 5, sortOrder: 2 },
    { name: "三等奖", count: 10, sortOrder: 3 },
    { name: "参与奖", count: 20, sortOrder: 4 },
  ];
}

async function listActivities() {
  const result = await db.collection(COLLECTIONS.activities).orderBy("updatedAt", "desc").get();
  return result.data.map(mapActivity);
}

async function getActivityById(activityId) {
  const result = await db.collection(COLLECTIONS.activities).where({ id: activityId }).limit(1).get();
  return result.data.length ? mapActivity(result.data[0]) : null;
}

async function saveActivity(input) {
  const activityId = String(input.activityId || input.id || "demo-activity");
  const existing = await db
    .collection(COLLECTIONS.activities)
    .where({ id: activityId })
    .limit(1)
    .get();

  if (!existing.data.length) throw createHttpError(404, "活动不存在");

  const updateData = {
    name: String(input.name || "默认演示活动").trim(),
    registerBgUrl: String(input.registerBgUrl || "").trim(),
    drawTitle: String(input.drawTitle || "幸运抽奖").trim(),
    prizeConfigs: normalizePrizeConfigs(input.prizeConfigs),
    updatedAt: new Date().toISOString(),
  };

  await db.collection(COLLECTIONS.activities).doc(existing.data[0]._id).update({
    data: updateData,
  });

  return getActivityById(activityId);
}

function normalizePrizeConfigs(prizeConfigs) {
  const source = Array.isArray(prizeConfigs) && prizeConfigs.length ? prizeConfigs : defaultPrizeConfigs();
  return source
    .map((item, index) => ({
      name: String(item.name || "").trim() || `奖项${index + 1}`,
      count: Math.max(1, Number(item.count || 1)),
      sortOrder: Number(item.sortOrder || index + 1),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

async function registerParticipant(body) {
  const activityId = String(body.activityId || "demo-activity");
  const nickname = String(body.nickname || "").trim();
  const avatarUrl = String(body.avatarUrl || body.avatarDataUrl || "").trim();

  if (!nickname) throw createHttpError(400, "请输入昵称");
  if (!avatarUrl) throw createHttpError(400, "请先选择头像");

  const activity = await getActivityById(activityId);
  if (!activity) throw createHttpError(404, "活动不存在");

  let openid = String(body.openid || "").trim();
  if (!openid && body.code) {
    const session = await exchangeCodeForSession(body.code);
    openid = session.openid;
  }
  if (!openid) {
    openid = `mock_${createId()}`;
  }

  const existing = await db
    .collection(COLLECTIONS.participants)
    .where({ activityId, openid })
    .limit(1)
    .get();

  if (existing.data.length) {
    return mapParticipant(existing.data[0]);
  }

  const participant = {
    id: createId(),
    activityId,
    openid,
    nickname,
    avatarUrl,
    createdAt: new Date().toISOString(),
  };

  await db.collection(COLLECTIONS.participants).add({ data: participant });
  return participant;
}

async function listParticipants(activityId) {
  const participants = await db
    .collection(COLLECTIONS.participants)
    .where({ activityId })
    .orderBy("createdAt", "desc")
    .get();

  const winnerMap = await buildWinnerMap(activityId);
  return participants.data.map((item) => ({
    ...mapParticipant(item),
    wins: winnerMap.get(item.id) || [],
  }));
}

async function listEligibleParticipants(activityId) {
  const participants = await db
    .collection(COLLECTIONS.participants)
    .where({ activityId })
    .orderBy("createdAt", "desc")
    .get();

  const winnerIds = await getWinnerParticipantIds(activityId);
  return participants.data
    .filter((item) => !winnerIds.has(item.id))
    .map(mapParticipant);
}

async function createDrawRecord(body) {
  const activityId = String(body.activityId || "demo-activity");
  const prizeName = String(body.prizeName || body.title || "").trim();
  const drawCount = Math.max(1, Number(body.drawCount || 1));

  if (!prizeName) throw createHttpError(400, "请先填写奖项名称");

  const activity = await getActivityById(activityId);
  if (!activity) throw createHttpError(404, "活动不存在");

  const drawRecord = {
    id: createId(),
    activityId,
    title: prizeName,
    drawCount,
    status: "rolling",
    createdAt: new Date().toISOString(),
    stoppedAt: null,
  };

  await db.collection(COLLECTIONS.drawRecords).add({ data: drawRecord });
  return drawRecord;
}

async function stopDraw(drawRecordId) {
  const drawRecord = await getDrawRecordById(drawRecordId);
  if (!drawRecord) throw createHttpError(404, "抽奖记录不存在");

  if (drawRecord.status === "completed") {
    return {
      drawRecord,
      winners: await getWinnersByDrawRecordId(drawRecordId),
    };
  }

  const pool = await listEligibleParticipants(drawRecord.activityId);
  shuffle(pool);
  const winners = pool.slice(0, Math.min(drawRecord.drawCount, pool.length));
  const now = new Date().toISOString();

  for (let index = 0; index < winners.length; index += 1) {
    await db.collection(COLLECTIONS.drawWinners).add({
      data: {
        id: createId(),
        activityId: drawRecord.activityId,
        drawRecordId,
        participantId: winners[index].id,
        prizeOrder: index + 1,
        createdAt: now,
      },
    });
  }

  const rawRecord = await db
    .collection(COLLECTIONS.drawRecords)
    .where({ id: drawRecordId })
    .limit(1)
    .get();

  await db.collection(COLLECTIONS.drawRecords).doc(rawRecord.data[0]._id).update({
    data: {
      status: "completed",
      stoppedAt: now,
    },
  });

  return {
    drawRecord: await getDrawRecordById(drawRecordId),
    winners: await getWinnersByDrawRecordId(drawRecordId),
  };
}

async function getDrawRecordById(drawRecordId) {
  const result = await db
    .collection(COLLECTIONS.drawRecords)
    .where({ id: drawRecordId })
    .limit(1)
    .get();
  return result.data.length ? mapDrawRecord(result.data[0]) : null;
}

async function listDrawRecords(activityId) {
  const records = await db
    .collection(COLLECTIONS.drawRecords)
    .where({ activityId })
    .orderBy("createdAt", "desc")
    .get();

  const result = [];
  for (const item of records.data) {
    result.push({
      ...mapDrawRecord(item),
      winners: await getWinnersByDrawRecordId(item.id),
    });
  }
  return result;
}

async function getWinnersByDrawRecordId(drawRecordId) {
  const rows = await db
    .collection(COLLECTIONS.drawWinners)
    .where({ drawRecordId })
    .orderBy("prizeOrder", "asc")
    .get();

  const winners = [];
  for (const row of rows.data) {
    const participant = await getParticipantById(row.participantId);
    if (participant) {
      winners.push({
        ...participant,
        prizeOrder: row.prizeOrder,
      });
    }
  }
  return winners;
}

async function getParticipantById(participantId) {
  const result = await db
    .collection(COLLECTIONS.participants)
    .where({ id: participantId })
    .limit(1)
    .get();
  return result.data.length ? mapParticipant(result.data[0]) : null;
}

async function buildWinnerMap(activityId) {
  const result = new Map();
  const drawRecords = await db.collection(COLLECTIONS.drawRecords).where({ activityId }).get();
  const titleMap = new Map(drawRecords.data.map((item) => [item.id, item.title]));
  const drawRecordIds = drawRecords.data.map((item) => item.id);

  if (!drawRecordIds.length) return result;

  const winnerRows = await fetchAllByIds(COLLECTIONS.drawWinners, "drawRecordId", drawRecordIds);
  winnerRows.forEach((row) => {
    const wins = result.get(row.participantId) || [];
    wins.push({
      title: titleMap.get(row.drawRecordId) || "",
      prizeOrder: row.prizeOrder,
      createdAt: row.createdAt,
    });
    result.set(row.participantId, wins);
  });

  return result;
}

async function getWinnerParticipantIds(activityId) {
  const winners = await db.collection(COLLECTIONS.drawWinners).where({ activityId }).get();
  return new Set(winners.data.map((item) => item.participantId));
}

async function getActivityStats(activityId) {
  const participants = await db.collection(COLLECTIONS.participants).where({ activityId }).get();
  const winnerIds = await getWinnerParticipantIds(activityId);
  const drawRecords = await db.collection(COLLECTIONS.drawRecords).where({ activityId }).get();

  return {
    totalParticipants: participants.data.length,
    totalWinners: winnerIds.size,
    pendingParticipants: Math.max(0, participants.data.length - winnerIds.size),
    totalDraws: drawRecords.data.length,
  };
}

async function getGroupedResults(activityId) {
  const drawRecords = await listDrawRecords(activityId);
  const activity = await getActivityById(activityId);
  const configMap = new Map((activity?.prizeConfigs || []).map((item) => [item.name, item.sortOrder]));

  return drawRecords
    .slice()
    .sort((a, b) => {
      const orderA = configMap.get(a.title) || 999;
      const orderB = configMap.get(b.title) || 999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .map((item) => ({
      title: item.title,
      winners: item.winners,
    }));
}

async function buildResultsCsv(activityId) {
  const rows = [["prizeName", "winnerOrder", "nickname", "openid", "createdAt"]];
  const records = await listDrawRecords(activityId);

  records.forEach((record) => {
    record.winners.forEach((winner) => {
      rows.push([
        record.title,
        String(winner.prizeOrder),
        winner.nickname,
        winner.openid,
        record.createdAt,
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

async function resetActivity(activityId) {
  await removeByWhere(COLLECTIONS.drawWinners, { activityId });
  await removeByWhere(COLLECTIONS.drawRecords, { activityId });
  await removeByWhere(COLLECTIONS.participants, { activityId });

  const activityRows = await db
    .collection(COLLECTIONS.activities)
    .where({ id: activityId })
    .limit(1)
    .get();

  if (activityRows.data.length) {
    await db.collection(COLLECTIONS.activities).doc(activityRows.data[0]._id).update({
      data: {
        prizeConfigs: defaultPrizeConfigs(),
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

async function removeByWhere(collectionName, where) {
  const rows = await db.collection(collectionName).where(where).get();
  for (const row of rows.data) {
    await db.collection(collectionName).doc(row._id).remove();
  }
}

async function fetchAllByIds(collectionName, fieldName, ids) {
  if (!ids.length) return [];
  const rows = [];
  const chunkSize = 50;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const result = await db.collection(collectionName).where({ [fieldName]: db.command.in(chunk) }).get();
    rows.push(...result.data);
  }

  return rows;
}

async function exchangeCodeForSession(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) throw createHttpError(400, "wx.login code is required.");

  if (!APP_ID || !APP_SECRET) {
    return {
      openid: `dev_${trimmed}`,
      session_key: "dev-session-key",
      unionid: "",
      mocked: true,
    };
  }

  const url =
    "https://api.weixin.qq.com/sns/jscode2session" +
    `?appid=${encodeURIComponent(APP_ID)}` +
    `&secret=${encodeURIComponent(APP_SECRET)}` +
    `&js_code=${encodeURIComponent(trimmed)}` +
    "&grant_type=authorization_code";

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw createHttpError(400, data.errmsg || "Failed to exchange code2Session.");
  }
  return data;
}

function mapActivity(row) {
  return {
    id: row.id,
    name: row.name,
    registerBgUrl: row.registerBgUrl || "",
    drawTitle: row.drawTitle || "",
    prizeConfigs: normalizePrizeConfigs(row.prizeConfigs),
    status: row.status || "active",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapParticipant(row) {
  return {
    id: row.id,
    activityId: row.activityId,
    openid: row.openid,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
  };
}

function mapDrawRecord(row) {
  return {
    id: row.id,
    activityId: row.activityId,
    title: row.title,
    drawCount: row.drawCount,
    status: row.status,
    createdAt: row.createdAt,
    stoppedAt: row.stoppedAt,
  };
}

function serveStatic(res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) {
    respondText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      respondText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(createHttpError(413, "Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(createHttpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createHttpError(statusCode, message, detail = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detail = detail;
  return error;
}

function respondJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function respondText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
