const { isAdminConfigReady, isAdminRequest } = require("./auth");
const { json } = require("./http");

function requireAdmin(req, res) {
  if (!isAdminConfigReady()) {
    json(res, 503, { success: false, error: "Admin chưa được cấu hình trên máy chủ" });
    return false;
  }
  if (!isAdminRequest(req)) {
    json(res, 401, { success: false, error: "Bạn cần đăng nhập quản trị" });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
