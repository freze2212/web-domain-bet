import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getAllPagesProjectsForAccount } from "./cloudflare.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, "../data/pages_domain_map.json");
const REFRESH_MS = 10 * 60_000;

let state = { at: 0, domains: {} };
try {
  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  if (raw && typeof raw.domains === "object") state = raw;
} catch {}

const apexOf = (d) => String(d || "").trim().toLowerCase().replace(/^www\./, "");

/** Project Pages đang gắn custom domain này (nguồn: Cloudflare, không phải domains.json/history). */
export function getServingPagesProject(domain) {
  return state.domains[apexOf(domain)] || null;
}

export function pagesDomainMapVersion() {
  return state.at;
}

let refreshing = null;
export async function refreshPagesDomainMap() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const accounts = [];
    const frezeAcc = config.cloudflare.accountId();
    if (frezeAcc) accounts.push({ id: frezeAcc, token: config.cloudflare.token() });
    const adminAcc = config.cloudflare.adminAccountId();
    const adminTok = config.cloudflare.adminToken();
    if (adminAcc && adminTok && adminAcc !== frezeAcc) accounts.push({ id: adminAcc, token: adminTok });

    const domains = {};
    for (const acc of accounts) {
      const projects = await getAllPagesProjectsForAccount(acc.id, { token: acc.token });
      for (const p of projects) {
        for (const d of p.domains || []) {
          if (String(d).endsWith(".pages.dev")) continue;
          const apex = apexOf(d);
          const row = domains[apex] || { project: p.name, accountId: acc.id, projects: [] };
          if (!row.projects.includes(p.name)) row.projects.push(p.name);
          domains[apex] = row;
        }
      }
    }
    state = { at: Date.now(), domains };
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(state), "utf8");
    return { count: Object.keys(domains).length, accounts: accounts.length };
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// --- 302 thật: mở thử miền, đọc Location (Page Rule / Redirect Rule / Worker đều ra ở đây) ---
const REDIRECT_CACHE_PATH = path.resolve(__dirname, "../data/live_redirects.json");
let redirects = { at: 0, domains: {} };
try {
  const raw = JSON.parse(fs.readFileSync(REDIRECT_CACHE_PATH, "utf8"));
  if (raw && typeof raw.domains === "object") redirects = raw;
} catch {}

/** Nơi miền đang thật sự chuyển tới (bỏ qua bước nhảy sang www/https của chính nó). */
export function getLiveRedirect(domain) {
  return redirects.domains[apexOf(domain)] || null;
}

export function liveRedirectsVersion() {
  return redirects.at;
}

export async function probeLiveRedirect(domain) {
  return probeRedirect(apexOf(domain)).catch(() => null);
}

async function probeRedirect(domain) {
  let url = `https://${domain}/`;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (LandingHub-302-probe)" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status < 300 || res.status >= 400) return null;
    const loc = res.headers.get("location");
    if (!loc) return null;
    const next = new URL(loc, url);
    if (apexOf(next.hostname) !== domain) return { location: next.href, status: res.status };
    url = next.href;
  }
  return null;
}

let probing = null;
export async function refreshLiveRedirects(domainList) {
  if (probing) return probing;
  probing = (async () => {
    const list = [...new Set((domainList || []).map(apexOf).filter((d) => d && d.includes(".")))];
    const found = {};
    let failed = 0;
    for (let i = 0; i < list.length; i += 10) {
      await Promise.all(
        list.slice(i, i + 10).map(async (d) => {
          try {
            const r = await probeRedirect(d);
            if (r) found[d] = { ...r, at: Date.now() };
          } catch {
            failed++;
            // Không mở được lần này: giữ kết quả cũ, không coi là đã hết 302
            if (redirects.domains[d]) found[d] = redirects.domains[d];
          }
        })
      );
    }
    redirects = { at: Date.now(), domains: found };
    fs.mkdirSync(path.dirname(REDIRECT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(REDIRECT_CACHE_PATH, JSON.stringify(redirects), "utf8");
    return { probed: list.length, redirects: Object.keys(found).length, failed };
  })().finally(() => {
    probing = null;
  });
  return probing;
}

let timer = null;
export function startPagesDomainMapRefresher(getDomainList = () => []) {
  const run = async () => {
    await refreshPagesDomainMap()
      .then((r) => console.log(`[PagesMap] ${r.count} miền đang gắn Pages (${r.accounts} tài khoản)`))
      .catch((e) => console.warn("[PagesMap] refresh lỗi:", e.message));
    await refreshLiveRedirects(getDomainList())
      .then((r) => console.log(`[Live302] mở thử ${r.probed} miền, ${r.redirects} miền đang chuyển hướng, ${r.failed} lỗi`))
      .catch((e) => console.warn("[Live302] lỗi:", e.message));
  };
  setTimeout(run, 3000);
  if (timer) clearInterval(timer);
  timer = setInterval(run, REFRESH_MS);
}
