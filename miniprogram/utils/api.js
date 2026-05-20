const CONTAINER_ENV = "prod-d7gsk63mfd883e0b4";
const CONTAINER_SERVICE = "express-914c";

function request({ path, method = "GET", data, header = {} }) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: {
        env: CONTAINER_ENV,
      },
      path,
      method,
      data,
      header: {
        "X-WX-SERVICE": CONTAINER_SERVICE,
        ...header,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(res.data || { error: "Request failed." });
      },
      fail: (error) => {
        reject({
          error: error.errMsg || "Container request failed.",
          detail: error,
        });
      },
    });
  });
}

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject,
    });
  });
}

function readFileAsDataUrl(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: (info) => {
        const readTarget = (targetPath) => {
          wx.getFileSystemManager().readFile({
            filePath: targetPath,
            encoding: "base64",
            success: (res) => {
              resolve(`data:image/png;base64,${res.data}`);
            },
            fail: (error) => {
              reject({
                error: error.errMsg || "Read avatar file failed.",
                detail: error,
              });
            },
          });
        };

        if (info.size > 1024 * 1024) {
          wx.compressImage({
            src: filePath,
            quality: 60,
            success: (compressRes) => {
              readTarget(compressRes.tempFilePath);
            },
            fail: () => {
              readTarget(filePath);
            },
          });
          return;
        }

        readTarget(filePath);
      },
      fail: (error) => {
        reject({
          error: error.errMsg || "Read avatar file failed.",
          detail: error,
        });
      },
    });
  });
}

function getAdminSession() {
  return wx.getStorageSync("admin_session") || null;
}

function getAdminHeader() {
  const session = getAdminSession();
  if (!session || !session.password) return {};
  return {
    "x-admin-password": session.password,
  };
}

module.exports = {
  request,
  login,
  readFileAsDataUrl,
  getAdminSession,
  getAdminHeader,
};
