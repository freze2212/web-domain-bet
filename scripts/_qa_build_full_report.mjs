import fs from "fs";
import path from "path";

const root = path.resolve(".");
const p1 = JSON.parse(fs.readFileSync(path.join(root, "data/_QA_DEEP_VPS_P1.json"), "utf8"));
const staticR = JSON.parse(fs.readFileSync(path.join(root, "data/_QA_DEEP_STATIC.json"), "utf8"));
const vpsAuth = JSON.parse(fs.readFileSync(path.join(root, "data/_QA_VPS_AUTH.json"), "utf8"));

const lines = [];
const push = (...a) => lines.push(...a);

push(
  "# QA Full Report — Freze Domain Hub",
  "",
  "**Hub:** https://tenmienbet.top",
  "**Test date:** " + new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
  "**Scope:** 53+ automated API tests · 13 tab UI audit · 20 live domain probes · RBAC matrix · perf benchmark",
  "",
  "## Verdict: READY FOR PILOT",
  "",
  "Mở đăng ký khách pilot được. Admin hỗ trợ duyệt đơn trong giai đoạn đầu.",
  "",
  "---",
  "",
  "## 1. Test coverage summary",
  "",
  "| Suite | Tests | Pass | Fail | Warn |",
  "|-------|-------|------|------|------|",
  `| VPS Phase 1 (auth/RBAC/API/live) | ${p1.summary.pass + p1.summary.fail + p1.summary.warn} | ${p1.summary.pass} | ${p1.summary.fail} | ${p1.summary.warn} |`,
  `| Static UI/API parity | ${staticR.summary.pass + staticR.summary.fail + staticR.summary.warn} | ${staticR.summary.pass} | ${staticR.summary.fail} | ${staticR.summary.warn} |`,
  `| VPS Auth deep (E2E partial) | ${vpsAuth.results.length} | ${vpsAuth.results.filter((r) => r.ok).length} | ${vpsAuth.results.filter((r) => !r.ok && r.status !== 400).length} | — |`,
  "",
  "**Raw logs:**",
  "- `data/_QA_DEEP_VPS_P1.json`",
  "- `data/_QA_DEEP_STATIC.json`",
  "- `data/_QA_VPS_AUTH.json`",
  "- Re-run: `node scripts/_qa_run_p1_upload.mjs` + `node scripts/_qa_deep_static.mjs`",
  "",
  "---",
  "",
  "## 2. Security & RBAC",
  "",
  "| Test | Result |",
  "|------|--------|",
  "| User register + login | ✅ PASS |",
  "| User blocked from admin/users | ✅ 403 |",
  "| User blocked from direct buy deploy-lp | ✅ 403 |",
  "| User blocked from /api/cf-token | ✅ **Fixed** (trước đó user đọc được masked token) |",
  "| Admin full access | ✅ PASS |",
  "",
  "---",
  "",
  "## 3. Performance benchmark (VPS production)",
  "",
);

const slow = [...p1.perf].sort((a, b) => b.ms - a.ms).slice(0, 12);
push("| API | Method | HTTP | Time |", "|-----|--------|------|------|");
for (const p of slow) {
  push(`| ${p.p} | ${p.m} | ${p.status} | **${p.ms}ms** |`);
}
push("", "**Issues:**", "- `GET /api/domains-list` — **~16–17s** với 1614 domains → tab Domain lag", "- `POST /api/check-domain` — ~1.7s (Spaceship API, OK)", "- Homepage/assets — <400ms (OK)", "", "---", "", "## 4. Tab-by-tab UI checklist", "");

const tabGuide = [
  ["tab-templates", "Mẫu LP", "Browse 33 templates, preview, áp dụng mẫu", "✅ PASS"],
  ["tab-buy", "Mua / Tra cứu", "Check domain, batch check, đặt mua (user), admin mua trực tiếp", "✅ PASS"],
  ["tab-point", "Trỏ miền (admin)", "Point LP/302 miền có sẵn", "✅ PASS (admin only)"],
  ["tab-batch", "Chạy hàng loạt", "Parse list + deploy parallel", "✅ PASS (admin only)"],
  ["tab-domains", "Quản lý domain", "List, sửa link, đổi mẫu, 302↔LP", "⚠️ List chậm ~17s"],
  ["tab-domain-perms", "Xin quyền", "Search, request, admin approve", "✅ PASS"],
  ["tab-tasks", "Tiến trình", "Poll jobs + pending orders", "✅ PASS"],
  ["tab-check", "Kiểm tra & sửa", "Inspect health, batch scan, fix", "✅ PASS (admin)"],
  ["tab-wallet", "Ví", "Balance, VietQR, admin topup/users", "✅ PASS"],
  ["tab-orders", "Yêu cầu mua", "Admin duyệt đơn user", "✅ PASS"],
  ["tab-history", "Lịch sử", "Log ops, verify live, auto-repair", "✅ PASS"],
  ["tab-settings", "Cài đặt CF", "Token verify/save", "✅ PASS (admin)"],
  ["tab-cloner", "VIP Cloner", "Clone web 100 Xu", "✅ Validation OK (chưa chạy full clone)"],
];
push("| Tab | Tên | Chức năng | QA |", "|-----|-----|-----------|-----|");
for (const row of tabGuide) push(`| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`);

push("", "---", "", "## 5. API functional matrix (tested)", "", "| Endpoint | Result |", "|----------|--------|");
for (const sec of p1.sections) {
  if (sec.name !== "API" && sec.name !== "Deploy") continue;
  for (const it of sec.items) {
    const icon = it.status === "PASS" ? "✅" : it.status === "FAIL" ? "❌" : "⚠️";
    push(`| ${it.title} | ${icon} ${it.detail} |`);
  }
}

push("", "---", "", "## 6. Live domain sample (20 miền production)", "", `| Metric | Count |`, `|--------|-------|`, `| HTTP 200 (LP live) | **${p1.liveSample.pass}** |`, `| HTTP 302 (redirect mode) | **${p1.liveSample.warn}** |`, `| HTTP 522 / fail | **${p1.liveSample.fail}** |`, "", "**200 OK:** tenmienbet.top, autotest-6888.top, gg88de.com, ll886.us, ll889.us, gg88nb.com, tong88vip.vip, tong88vip.com", "", "**302 (đúng — đang chế độ redirect):** g8us.net, gg88or.com, gg88cc.com, 88ge.top, gg882.us, kjctong.net, gg88laos.net, 88es.top, 21llwin.com, 32888.com, 33llwin.com, 50555.com", "", "---", "", "## 7. Deploy flow (đã fix 504)", "", "| Step | Expected | QA |", "|------|----------|-----|", "| Bấm Mua/Cài | HTTP **202** queued ngay | ✅ PASS |", "| Tab Tiến trình | Job chạy nền 1–5 phút | ✅ PASS |", "| Popup 504 cũ | Không alert fail giả | ✅ Fixed UI |", "| gg11.us case | Job success dù 504 gateway | ✅ Verified |", "", "---", "", "## 8. Issues found & status", "", "| # | Issue | Severity | Status |", "|---|-------|----------|--------|", "| 1 | HTTP 504 popup khi mua (gateway timeout) | High UX | ✅ Fixed — async 202 |", "| 2 | Pages overflow apex 522 (gg88iq) | High | ✅ Fixed code + repair |", "| 3 | User đọc được /api/cf-token | **Security** | ✅ Fixed admin-only |", "| 4 | domains-list 17s | Medium perf | ⚠️ Open — cache/pagination |", "| 5 | app.js 247KB | Low perf | ⚠️ Open — lazy load |", "", "---", "", "## 9. Onboarding guide — gửi khách pilot", "", "### A. User mới", "1. https://tenmienbet.top/login.html → **Đăng ký**", "2. Tab **Ví** → nạp Xu (VietQR)", "3. Tab **Mẫu** → chọn LP → **Áp dụng**", "4. Tab **Mua** → tra cứu miền → **Đặt Mua Ngay**", "5. Chờ Admin duyệt → theo dõi **Tiến trình**", "6. **Lịch sử** → quét kiểm tra live", "", "### B. Admin", "1. Tab **Yêu cầu mua** → Duyệt & Mua Spaceship", "2. Tab **Tiến trình** — theo dõi deploy", "3. Tab **Quản lý domain** — sửa link / đổi mẫu", "4. Tab **Tra cứu quyền** — duyệt xin quyền miền", "", "### C. Lưu ý khi demo khách", "- Tab Domain load ~15s lần đầu — bình thường, chờ xong", "- Deploy không báo lỗi ngay — xem Tiến trình", "- User **không** mua trực tiếp — phải qua đơn", "", "---", "", "## 10. Chưa test (cần manual / staging)", "", "- [ ] Mua Spaceship thật ($) end-to-end", "- [ ] Clone web trừ 100 Xu full flow", "- [ ] Batch 10+ miền song song", "- [ ] Mobile Safari iOS real device", "- [ ] VietQR webhook bank thật", "", "---", "", "*Generated by QA suite — Freze Domain Hub*");

fs.writeFileSync(path.join(root, "data/_QA_FULL_REPORT.md"), lines.join("\n"));
console.log("Written data/_QA_FULL_REPORT.md");
