const envMap = {
  dev: {
    name: "本地开发",
    apiBase: "http://127.0.0.1:3000",
  },
  prod: {
    name: "正式环境",
    apiBase: "https://ai.gogohan.top",
  },
};

// 切换环境时只改这里：
const currentEnv = "prod";

module.exports = {
  currentEnv,
  envMap,
};
