import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("[Auth] Thiếu JWT_SECRET trong .env — dùng secret tạm (chỉ nên cho local). Đặt JWT_SECRET trên VPS!");
}
const RESOLVED_JWT_SECRET = JWT_SECRET || "freze_jwt_super_secret_key_2026_!@#$%^";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * Generate HMAC-SHA256 JWT Token
 */
export function signJwt(payload, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Date.now() + expiresInMs;
  const fullPayload = { ...payload, exp, iat: Date.now() };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", RESOLVED_JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify HMAC-SHA256 JWT Token
 */
export function verifyJwt(token) {
  if (!token) return null;
  const parts = token.replace(/^Bearer\s+/i, "").trim().split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", RESOLVED_JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Token expired
    }
    return payload;
  } catch {
    return null;
  }
}

function getInitialUsers() {
  return [
    {
      id: "u_admin",
      username: "admin",
      passwordHash: hashPassword("admin123"),
      fullName: "Tổng Quản Trị (Admin)",
      role: "admin",
      status: "active",
      createdAt: new Date().toISOString(),
    },
    {
      id: "u_member_demo",
      username: "demo_user",
      passwordHash: hashPassword("123456"),
      fullName: "Đại Lý Demo (User)",
      role: "user",
      status: "active",
      createdAt: new Date().toISOString(),
    },
  ];
}

export function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const init = getInitialUsers();
    fs.writeFileSync(USERS_FILE, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return getInitialUsers();
  }
}

export function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export function login(username, password) {
  const users = loadUsers();
  const u = users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
  if (!u) {
    throw new Error("Tài khoản không tồn tại");
  }
  if (u.status !== "active") {
    throw new Error("Tài khoản này đã bị khóa hoặc vô hiệu hóa");
  }
  const hash = hashPassword(password);
  if (u.passwordHash !== hash) {
    throw new Error("Mật khẩu không chính xác");
  }

  const token = signJwt({
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
  });

  return {
    token,
    user: {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
    },
  };
}

export function register({ username, password, fullName, role = "user" }) {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error("Tên đăng nhập phải có ít nhất 3 ký tự");
  }
  if (!password || password.length < 5) {
    throw new Error("Mật khẩu phải có ít nhất 5 ký tự");
  }

  const users = loadUsers();
  if (users.some((x) => x.username.toLowerCase() === cleanUsername)) {
    throw new Error("Tên đăng nhập đã được sử dụng");
  }

  const newUser = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: cleanUsername,
    passwordHash: hashPassword(password),
    fullName: fullName || cleanUsername,
    role: role === "admin" ? "admin" : "user",
    status: "active",
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  const token = signJwt({
    userId: newUser.id,
    username: newUser.username,
    fullName: newUser.fullName,
    role: newUser.role,
  });

  return {
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      role: newUser.role,
      status: newUser.status,
    },
  };
}

export function verifyToken(token) {
  return verifyJwt(token);
}

export function listUsers() {
  const users = loadUsers();
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
  }));
}

export function getUserById(id) {
  const users = loadUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
  };
}

export function createUserByAdmin({ username, password, fullName, role = "user", initialBalance = 0 }) {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) throw new Error("Tên đăng nhập tối thiểu 3 ký tự");
  if (!password || password.length < 5) throw new Error("Mật khẩu tối thiểu 5 ký tự");

  const users = loadUsers();
  if (users.some((x) => x.username.toLowerCase() === cleanUsername)) {
    throw new Error("Tên đăng nhập đã tồn tại");
  }

  const newUser = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: cleanUsername,
    passwordHash: hashPassword(password),
    fullName: fullName || cleanUsername,
    role: role === "admin" ? "admin" : "user",
    status: "active",
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  return newUser;
}

export function updateUserByAdmin(userId, { fullName, password, role, status }) {
  const users = loadUsers();
  const u = users.find((x) => x.id === userId);
  if (!u) throw new Error("Không tìm thấy người dùng");

  if (fullName !== undefined) u.fullName = fullName;
  if (password) u.passwordHash = hashPassword(password);
  if (role !== undefined) u.role = role === "admin" ? "admin" : "user";
  if (status !== undefined) u.status = status;

  saveUsers(users);
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
  };
}

export function deleteUserByAdmin(userId) {
  const users = loadUsers();
  const idx = users.findIndex((x) => x.id === userId);
  if (idx === -1) throw new Error("Không tìm thấy người dùng để xóa");
  if (users[idx].username === "admin") throw new Error("Không thể xóa tài khoản Quản trị viên tối cao (admin)");

  users.splice(idx, 1);
  saveUsers(users);
  return true;
}
