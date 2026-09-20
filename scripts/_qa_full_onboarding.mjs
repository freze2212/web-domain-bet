/**
 * Full QA / onboarding readiness — API + perf + UI structure
 * Output: data/_QA_ONBOARDING_REPORT.md + data/_QA_ONBOARDING_<ts>.json
 */
import fs from "fs";
import path from "path";

const root = path.resolve(".");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const BASE = process.env.HUB_URL || "https://tenmienbet.top";
const stamp = Date.now();
const OUT_JSON = path.join(root, "data", `_QA_ONBOARDING_${stamp}.json`);
const OUT_MD = path.join(root, "data", "_QA_ONBOARDING_REPORT.md");

const report = {
  generatedAt: new Date().toISOString(),
  hubUrl: BASE,
  environment: "production",
  summary: { pass: 0, fail: 0, warn: 0, skip: 0 },
  sections: [],
  performance: {},
  ui: {},
  blockers: [],
  recommendations: [],
};

function bump(status) {
  report.summary[status === "PASS" ? "pass" : status === "FAIL" ? "fail" : status === "WARN" ? "warn" : "skip"]++;
}

function log(section, id, title, status, detail = "", ms = 0) {
  bump(status);
  let sec = report.sections.find((s) => s.name === section);
  if (!sec) {
    sec = { name: section, items: [] };
    report.sections.push(sec);
  }
  sec.items.push({ id, title, status, detail, ms });
  const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️", SKIP: "⏭️" }[status] || "•";
  console.log(`${icon} [${section}] ${id} ${title}${detail ? " — " + detail : ""}${ms ? ` (${ms}ms)` : ""}`);
  if (status === "FAIL") report.blockers.push(`[${section}] ${id}: ${title}${detail ? " — " + detail : ""}`);
}

let token = "";
let adminUser = null;

function authHeaders() {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function timedFetch(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000) });
  const text = await r.text();
  const ms = Date.now() - t0;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: r.status, ms, text, json, headers: Object.fromEntries(r.headers.entries()) };
}

async function api(method, p, body, opts = {}) {
  return timedFetch(`${BASE}${p}`, {
    method,
    headers: opts.noAuth ? { "Content-Type": "application/json" } : authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    timeout: opts.timeout || 60000,
  });
}

// ─── 1. INFRA & PERFORMANCE ───────────────────────────────────────────────
console.log("\n=== 1. INFRA & PERFORMANCE ===");

for (const [label, url] of [
  ["Homepage", `${BASE}/`],
  ["Login", `${BASE}/login.html`],
  ["App JS", `${BASE}/app.js`],
  ["Styles", `${BASE}/style.css`],
]) {
  try {
    const r = await timedFetch(url, { timeout: 20000 });
    const size = r.text.length;
    const cache = r.headers["cache-control"] || r.headers["Cache-Control"] || "none";
    report.performance[label] = { ms: r.ms, status: r.status, bytes: size, cache };
    const perfOk = r.status === 200 && r.ms < 5000;
    log("Infra", label.replace(/\s/g, ""), `${label} load`, perfOk ? "PASS" : r.status !== 200 ? "FAIL" : "WARN", `HTTP ${r.status}, ${Math.round(size / 1024)}KB, ${r.ms}ms`, r.ms);
    if (label === "App JS" && size > 800000) {
      log("Perf", "appjs-size", "app.js bundle size", "WARN", `${Math.round(size / 1024)}KB — consider split/lazy load`, r.ms);
      report.recommendations.push("app.js >800KB: lazy-load tab modules hoặc minify thêm");
    }
  } catch (e) {
    log("Infra", label, `${label} load`, "FAIL", e.message);
  }
}

// API latency sample
const latencies = [];
for (let i = 0; i < 5; i++) {
  const r = await timedFetch(`${BASE}/api/templates`, { timeout: 15000 });
  latencies.push(r.ms);
}
const avgLat = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
report.performance.templatesApiAvgMs = avgLat;
log("Perf", "templates-latency", "GET /api/templates x5 avg", avgLat < 800 ? "PASS" : "WARN", `${avgLat}ms avg`, avgLat);

// ─── 2. AUTH ───────────────────────────────────────────────────────────────
console.log("\n=== 2. AUTH ===");

const badLogin = await api("POST", "/api/auth/login", { username: "___invalid___", password: "wrong" }, { noAuth: true });
log("Auth", "login-bad", "Reject invalid credentials", badLogin.status === 401 || badLogin.status === 400 ? "PASS" : "FAIL", `HTTP ${badLogin.status}`, badLogin.ms);

// Mint admin JWT via VPS-style (local auth module if available, else login)
try {
  const auth = await import("../src/auth.js");
  const users = auth.loadUsers();
  adminUser = users.find((u) => u.username === "admin");
  if (adminUser) {
    token = auth.signJwt({
      userId: adminUser.id,
      username: adminUser.username,
      fullName: adminUser.fullName,
      role: adminUser.role,
    });
    log("Auth", "jwt-local", "Admin JWT mint (local auth.js)", "PASS", adminUser.username);
  }
} catch {
  const pass = process.env.HUB_ADMIN_PASS || "";
  if (pass) {
    const lr = await api("POST", "/api/auth/login", { username: "admin", password: pass }, { noAuth: true });
    if (lr.json?.token) {
      token = lr.json.token;
      log("Auth", "login-admin", "Admin login live", "PASS", `HTTP ${lr.status}`, lr.ms);
    } else {
      log("Auth", "login-admin", "Admin login live", "FAIL", lr.json?.error || `HTTP ${lr.status}`, lr.ms);
    }
  } else {
    log("Auth", "login-admin", "Admin login", "SKIP", "No HUB_ADMIN_PASS in .env");
  }
}

if (token) {
  const me = await api("GET", "/api/auth/me");
  log("Auth", "me", "GET /api/auth/me", me.json?.username ? "PASS" : "FAIL", me.json?.username || me.text?.slice(0, 80), me.ms);
}

// ─── 3. PUBLIC APIs ───────────────────────────────────────────────────────
console.log("\n=== 3. PUBLIC APIs ===");

const templates = await timedFetch(`${BASE}/api/templates`, { timeout: 15000 });
const tplCount = Array.isArray(templates.json?.templates) ? templates.json.templates.length : templates.json?.length || 0;
log("API", "templates", "GET /api/templates (public)", templates.status === 200 && tplCount > 0 ? "PASS" : "FAIL", `${tplCount} templates`, templates.ms);

const checkDom = await api("POST", "/api/check-domain", { domain: "example-test-qa-xyz123.com" }, { noAuth: true });
log("API", "check-domain", "POST /api/check-domain", checkDom.status === 200 ? "PASS" : "FAIL", `HTTP ${checkDom.status}`, checkDom.ms);

const batchCheck = await api("POST", "/api/check-domains-batch", { domains: ["gg88sk.com", "gg88iq.com"] }, { noAuth: true });
log("API", "check-batch", "POST /api/check-domains-batch", batchCheck.status === 200 ? "PASS" : "FAIL", `HTTP ${batchCheck.status}`, batchCheck.ms);

// ─── 4. AUTHENTICATED APIs (admin) ───────────────────────────────────────
if (!token) {
  log("API", "auth-block", "Authenticated API suite", "SKIP", "No admin token");
} else {
  console.log("\n=== 4. AUTHENTICATED APIs (admin) ===");

  const endpoints = [
    ["GET", "/api/domains-list", null, "domains-list"],
    ["GET", "/api/tasks", null, "tasks"],
    ["GET", "/api/history", null, "history"],
    ["GET", "/api/wallet/balance", null, "wallet-balance"],
    ["GET", "/api/wallet/transactions", null, "wallet-tx"],
    ["GET", "/api/domain-orders", null, "domain-orders"],
    ["GET", "/api/domain-requests", null, "domain-requests"],
    ["GET", "/api/admin/users", null, "admin-users"],
    ["GET", "/api/cf-token", null, "cf-token"],
    ["GET", "/api/domains/search?q=gg88", null, "domain-search"],
  ];

  for (const [method, p, body, id] of endpoints) {
    const r = await api(method, p, body);
    const ok = r.status >= 200 && r.status < 400;
    log("API", id, `${method} ${p}`, ok ? "PASS" : "FAIL", `HTTP ${r.status}`, r.ms);
  }

  // Deploy async 202 (point mode dry - use autotest if exists, skip actual deploy to avoid side effects)
  // Test deploy-lp validation only
  const missing = await api("POST", "/api/deploy-lp", { domain: "", link: "", templateId: "" });
  log("API", "deploy-lp-validate", "POST /api/deploy-lp validation", missing.status === 400 ? "PASS" : "WARN", `HTTP ${missing.status}`, missing.ms);

  const resolveLink = await api("GET", "/api/resolve-link?domain=gg88sk.com");
  log("API", "resolve-link", "GET /api/resolve-link", resolveLink.status === 200 ? "PASS" : "WARN", `HTTP ${resolveLink.status}`, resolveLink.ms);

  // Spaceship quote (no purchase)
  const quote = await api("POST", "/api/spaceship/quote", { domain: "qa-test-domain-xyz99.com" });
  log("API", "spaceship-quote", "POST /api/spaceship/quote", quote.status === 200 || quote.status === 400 ? "PASS" : "WARN", `HTTP ${quote.status}`, quote.ms);
}

// ─── 5. UI STRUCTURE (static analysis) ────────────────────────────────────
console.log("\n=== 5. UI STRUCTURE ===");

const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const loginHtml = fs.readFileSync(path.join(root, "public/login.html"), "utf8");

const requiredTabs = [
  "tab-templates", "tab-buy", "tab-point", "tab-cloner", "tab-batch", "tab-domains",
  "tab-domain-perms", "tab-tasks", "tab-check", "tab-wallet", "tab-orders", "tab-history", "tab-settings",
];
const missingTabs = requiredTabs.filter((t) => !indexHtml.includes(`id="${t}"`));
log("UI", "tabs", "All 13 hub tabs in index.html", missingTabs.length === 0 ? "PASS" : "FAIL", missingTabs.join(", ") || "OK");

const adminTabs = ["tab-point", "tab-batch", "tab-check", "tab-orders", "tab-settings"];
const adminGated = adminTabs.every((t) => indexHtml.includes(`data-tab="${t}"`) && indexHtml.includes('data-role="admin"'));
log("UI", "rbac-tabs", "Admin-only tabs have data-role=admin", adminGated ? "PASS" : "WARN", adminGated ? "OK" : "Some admin tabs missing role attr");

const viewportOk = indexHtml.includes("viewport") && loginHtml.includes("viewport");
log("UI", "viewport", "Mobile viewport meta", viewportOk ? "PASS" : "WARN", viewportOk ? "OK" : "Missing on login or index");

// Check critical element IDs referenced in app.js
const idRefs = [...appJs.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((m) => m[1]);
const uniqueIds = [...new Set(idRefs)].slice(0, 80);
const missingIds = uniqueIds.filter((id) => !indexHtml.includes(`id="${id}"`) && !loginHtml.includes(`id="${id}"`));
report.ui.missingElementIds = missingIds.slice(0, 20);
log("UI", "dom-ids", "Critical getElementById targets exist", missingIds.length === 0 ? "PASS" : "WARN", missingIds.length ? `${missingIds.length} missing (sample: ${missingIds.slice(0, 5).join(", ")})` : "OK");

// 504 fix: handleDeployApiResponse
const has504Fix = appJs.includes("handleDeployApiResponse") && appJs.includes("queued");
log("UI", "504-fix", "Deploy async UX (no false 504 alert)", has504Fix ? "PASS" : "FAIL", has504Fix ? "handleDeployApiResponse present" : "Missing");

const hasTaskPoll = appJs.includes("startTaskPolling") && appJs.includes("loadTasksList");
log("UI", "progress-ux", "Task polling on deploy", hasTaskPoll ? "PASS" : "FAIL", hasTaskPoll ? "OK" : "Missing");

// ─── 6. LIVE DOMAIN SPOT CHECKS ───────────────────────────────────────────
console.log("\n=== 6. LIVE DOMAIN SPOT CHECKS ===");

async function probeDomain(d) {
  try {
    const home = await timedFetch(`https://${d}/`, { timeout: 15000 });
    const dj = await timedFetch(`https://${d}/domains.json?v=${Date.now()}`, { timeout: 15000 });
    let link = "";
    if (dj.json) {
      const e = dj.json[d] || dj.json[`www.${d}`];
      link = typeof e === "string" ? e : e?.main_url || "";
    }
    return { home: home.status, dj: dj.status, link, ms: home.ms + dj.ms, hasDefault: !!(dj.json?.defaultLink || dj.json?.default_link) };
  } catch (e) {
    return { home: 0, dj: 0, link: "", error: e.message };
  }
}

const spotDomains = ["gg88sk.com", "gg88iq.com", "gg11.us", "autotest-6888.top"];
for (const d of spotDomains) {
  const p = await probeDomain(d);
  const ok = p.home === 200 && p.dj === 200 && p.link;
  log("Live", d, `Live probe ${d}`, ok ? "PASS" : p.home === 522 ? "FAIL" : "WARN", p.error || `home=${p.home} json=${p.dj} link=${p.link ? "yes" : "no"}${p.hasDefault ? " HAS defaultLink!" : ""}`, p.ms || 0);
  if (p.hasDefault) report.recommendations.push(`${d}: domains.json vẫn có defaultLink — nên strip`);
}

// ─── 7. SECURITY HEADERS ──────────────────────────────────────────────────
console.log("\n=== 7. SECURITY ===");

const homeHeaders = (await timedFetch(`${BASE}/`, { timeout: 15000 })).headers;
const hasHttps = BASE.startsWith("https://");
log("Security", "https", "Hub served over HTTPS", hasHttps ? "PASS" : "FAIL", BASE);
const xFrame = homeHeaders["x-frame-options"] || homeHeaders["X-Frame-Options"];
log("Security", "headers", "Security headers on homepage", xFrame ? "PASS" : "WARN", xFrame || "No X-Frame-Options (optional)");

// ─── SUMMARY ──────────────────────────────────────────────────────────────
const total = report.summary.pass + report.summary.fail + report.summary.warn + report.summary.skip;
const readiness =
  report.summary.fail === 0
    ? report.summary.warn <= 5
      ? "READY_FOR_PILOT"
      : "READY_WITH_WARNINGS"
    : "NOT_READY";

report.summary.total = total;
report.summary.readiness = readiness;

// Write outputs
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

const md = buildMarkdown(report);
fs.writeFileSync(OUT_MD, md);

console.log("\n=== SUMMARY ===");
console.log(`PASS ${report.summary.pass} | FAIL ${report.summary.fail} | WARN ${report.summary.warn} | SKIP ${report.summary.skip}`);
console.log(`Readiness: ${readiness}`);
console.log(`Report: ${OUT_MD}`);

function buildMarkdown(r) {
  const lines = [
    `# QA Onboarding Report — Freze Domain Hub`,
    ``,
    `**Generated:** ${r.generatedAt}  `,
    `**Hub URL:** ${r.hubUrl}  `,
    `**Readiness:** \`${r.summary.readiness}\`  `,
    `**Score:** ✅ ${r.summary.pass} pass · ❌ ${r.summary.fail} fail · ⚠️ ${r.summary.warn} warn · ⏭️ ${r.summary.skip} skip`,
    ``,
    `> Báo cáo này dùng để gửi khách trước khi mở đăng ký tài khoản. Luồng mong đợi: User đăng ký → nạp Xu → đặt mua miền → Admin duyệt → deploy LP/302 → theo dõi tab Tiến trình/Lịch sử.`,
    ``,
  ];

  if (r.blockers.length) {
    lines.push(`## 🚫 Blockers (${r.blockers.length})`, ``);
    for (const b of r.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }

  lines.push(`## ⚡ Performance`, ``);
  lines.push(`| Asset | Status | Time | Size |`);
  lines.push(`|-------|--------|------|------|`);
  for (const [k, v] of Object.entries(r.performance)) {
    if (typeof v !== "object" || !v.ms) continue;
    lines.push(`| ${k} | HTTP ${v.status} | ${v.ms}ms | ${v.bytes ? Math.round(v.bytes / 1024) + "KB" : "—"} |`);
  }
  if (r.performance.templatesApiAvgMs) lines.push(`| API /templates avg | — | ${r.performance.templatesApiAvgMs}ms | — |`);
  lines.push(``);

  for (const sec of r.sections) {
    lines.push(`## ${sec.name}`, ``);
    lines.push(`| ID | Test | Result | Detail |`);
    lines.push(`|----|------|--------|--------|`);
    for (const it of sec.items) {
      const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️", SKIP: "⏭️" }[it.status] || it.status;
      lines.push(`| ${it.id} | ${it.title} | ${icon} | ${(it.detail || "").replace(/\|/g, "/")} |`);
    }
    lines.push(``);
  }

  if (r.recommendations.length) {
    lines.push(`## 💡 Recommendations`, ``);
    for (const rec of r.recommendations) lines.push(`- ${rec}`);
    lines.push(``);
  }

  lines.push(`## 📋 Onboarding checklist cho khách`, ``);
  lines.push(`1. Truy cập ${r.hubUrl}/login.html → **Đăng ký** tài khoản`, ``);
  lines.push(`2. Tab **Ví** → nạp Xu qua VietQR (hoặc Admin cộng Xu pilot)`, ``);
  lines.push(`3. Tab **Mẫu Landing Page** → chọn mẫu → **Áp dụng**`, ``);
  lines.push(`4. Tab **Mua / Tra cứu** → tra cứu miền → **Đặt Mua Ngay** (User) hoặc Admin mua trực tiếp`, ``);
  lines.push(`5. Theo dõi **Tiến trình** — không đóng tab khi đang deploy (1–5 phút)`, ``);
  lines.push(`6. Tab **Lịch sử** → **Quét Kiểm Tra** xác nhận live 200 OK`, ``);
  lines.push(`7. Cần quản lý miền có sẵn → **Tra Cứu & Xin Quyền** → Admin duyệt`, ``);
  lines.push(``);
  lines.push(`---`, `*Auto-generated by scripts/_qa_full_onboarding.mjs*`);

  return lines.join("\n");
}
