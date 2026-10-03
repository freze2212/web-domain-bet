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

let timer = null;
export function startPagesDomainMapRefresher() {
  const run = () =>
    refreshPagesDomainMap()
      .then((r) => console.log(`[PagesMap] ${r.count} miền đang gắn Pages (${r.accounts} tài khoản)`))
      .catch((e) => console.warn("[PagesMap] refresh lỗi:", e.message));
  setTimeout(run, 3000);
  if (timer) clearInterval(timer);
  timer = setInterval(run, REFRESH_MS);
}
