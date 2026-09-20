/**
 * Static QA — UI/API parity, app.js coverage, HTML audit
 */
import fs from "fs";
import path from "path";

const root = path.resolve(".");
const OUT = path.join(root, "data", "_QA_DEEP_STATIC.json");

const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const loginHtml = fs.readFileSync(path.join(root, "public/login.html"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "public/../src/server.js"), "utf8");
const styleCss = fs.readFileSync(path.join(root, "public/style.css"), "utf8");

const report = { sections: [], summary: { pass: 0, fail: 0, warn: 0 } };

function log(sec, id, title, status, detail = "") {
  report.summary[status === "PASS" ? "pass" : status === "FAIL" ? "fail" : "warn"]++;
  let s = report.sections.find((x) => x.name === sec);
  if (!s) {
    s = { name: sec, items: [] };
    report.sections.push(s);
  }
  s.items.push({ id, title, status, detail });
}

// Server routes
const serverRoutes = [...serverJs.matchAll(/pathname === ["'](\/api\/[^"']+)["']/g)].map((m) => m[1]);
const uniqueServer = [...new Set(serverRoutes)].sort();

// app.js fetch routes
const appRoutes = [...appJs.matchAll(/fetch\(["'`](\/api\/[^"'`?]+)/g)].map((m) => m[1]);
const uniqueApp = [...new Set(appRoutes)].sort();

// Routes in app but maybe not in server (fuzzy)
const orphanApp = uniqueApp.filter((r) => {
  const base = r.replace(/\/:[^/]+/g, "");
  return !uniqueServer.some((s) => s.startsWith(base) || base.startsWith(s.replace(/\/$/, "")));
});

log("API Parity", "server-count", "Server API routes defined", "PASS", uniqueServer.length + " routes");
log("API Parity", "app-count", "app.js fetch calls to API", "PASS", uniqueApp.length + " unique paths");

if (orphanApp.length) {
  log("API Parity", "orphan", "app.js routes without server match", "WARN", orphanApp.slice(0, 10).join(", "));
} else {
  log("API Parity", "orphan", "app.js routes all matched", "PASS", "OK");
}

// Tab UI checklist
const tabs = [
  { id: "tab-templates", features: ["templateGrid", "btnQuickDeploy", "templateSearchInput"] },
  { id: "tab-buy", features: ["buyLpForm", "buy302Form", "btnCheckBuyLp"] },
  { id: "tab-point", features: ["pointLpForm", "point302Form"] },
  { id: "tab-batch", features: ["batchParseBtn", "batchRunBtn"] },
  { id: "tab-domains", features: ["domainSearchInput", "domainsTableBody"] },
  { id: "tab-domain-perms", features: ["permSearchInput"] },
  { id: "tab-tasks", features: ["tasksListContainer"] },
  { id: "tab-check", features: ["btnInspectDomain", "inspectorDomainInput"] },
  { id: "tab-wallet", features: ["walletBalanceDisplay"] },
  { id: "tab-orders", features: ["ordersTableBody"] },
  { id: "tab-history", features: ["historyTableBody"] },
  { id: "tab-settings", features: ["cfTokenInput"] },
  { id: "tab-cloner", features: ["btnSubmitClone", "clonerUrlInput"] },
];

for (const tab of tabs) {
  const tabOk = indexHtml.includes(`id="${tab.id}"`);
  const missing = tab.features.filter((f) => !indexHtml.includes(`id="${f}"`));
  log(
    "UI Tabs",
    tab.id,
    `Tab ${tab.id} + key elements`,
    tabOk && missing.length === 0 ? "PASS" : tabOk ? "WARN" : "FAIL",
    missing.length ? "missing: " + missing.join(", ") : "OK"
  );
}

// Modals
const modals = [
  "taskDetailModal",
  "topupModal",
  "confirmDomainPurchaseModal",
  "spaceshipBuyConfirmModal",
  "setLinkModal",
  "switchTemplateModal",
  "switchModeModal",
];
for (const m of modals) {
  log("UI Modals", m, `Modal ${m}`, indexHtml.includes(`id="${m}"`) ? "PASS" : "WARN", indexHtml.includes(`id="${m}"`) ? "OK" : "not in index.html");
}

// Performance static
const appKb = Math.round(appJs.length / 1024);
const cssKb = Math.round(styleCss.length / 1024);
const htmlKb = Math.round(indexHtml.length / 1024);
log("Perf Static", "bundle", "Asset sizes", appKb > 300 ? "WARN" : "PASS", `app.js ${appKb}KB, css ${cssKb}KB, html ${htmlKb}KB`);

// UX patterns
log("UX", "504", "handleDeployApiResponse", appJs.includes("handleDeployApiResponse") ? "PASS" : "FAIL", "");
log("UX", "poll", "Task polling", appJs.includes("startTaskPolling") && appJs.includes("rescheduleTaskPolling") ? "PASS" : "WARN", "");
log("UX", "rbac-ui", "updateUserUI role gating", appJs.includes("updateUserUI") && appJs.includes('data-role') ? "PASS" : "FAIL", "");
log("UX", "toast", "Toast notifications", appJs.includes("showToast") ? "PASS" : "WARN", "");

// Accessibility basics
log("A11y", "lang", "HTML lang attribute", indexHtml.includes('lang="vi"') ? "PASS" : "WARN", "");
log("A11y", "labels", "Form inputs with labels", indexHtml.includes("<label") ? "PASS" : "WARN", "");

// Login page
log("Login", "form", "Login form exists", loginHtml.includes("loginForm") || loginHtml.includes("login") ? "PASS" : "FAIL", "");
log("Login", "register", "Register toggle", loginHtml.includes("register") ? "PASS" : "WARN", "");

report.serverRoutes = uniqueServer;
report.appRoutes = uniqueApp;
report.orphanApp = orphanApp;

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log("Static QA:", report.summary.pass, "pass", report.summary.fail, "fail", report.summary.warn, "warn");
console.log("Written", OUT);
