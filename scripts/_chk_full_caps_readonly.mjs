/**
 * READ-ONLY capability check: Freze CF, Admin CF, Spaceship.
 */
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const FREZE = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const SP_KEY = process.env.SPACESHIP_API_KEY;
const SP_SEC = process.env.SPACESHIP_API_SECRET;

function mask(t) {
  if (!t) return "EMPTY";
  return `${t.slice(0, 10)}...${t.slice(-6)}`;
}

async function cf(tok, method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!j.success, err: j.errors?.[0]?.message || "", result: j.result };
}

async function findActiveZone(tok, acc) {
  const z = await cf(tok, "GET", `/zones?account.id=${encodeURIComponent(acc)}&status=active&per_page=5`);
  return (z.result || [])[0] || null;
}

async function checkAccount(label, tok, acc) {
  const out = { label, token: mask(tok), account: acc?.slice(0, 8) };
  if (!tok) {
    out.verify = "MISSING";
    return out;
  }
  const v = await cf(tok, "GET", "/user/tokens/verify");
  out.verify = v.ok ? v.result?.status : v.err;

  const pages = await cf(tok, "GET", `/accounts/${acc}/pages/projects?per_page=1`);
  out.pagesList = pages.ok ? "OK" : pages.err.slice(0, 80);

  const zone = await findActiveZone(tok, acc);
  out.zonesList = zone ? `OK (${zone.name})` : "no active zone / fail";

  // zone create permission: fake invalid TLD → 400 = has permission, 403 = no
  const create = await cf(tok, "POST", "/zones", {
    name: "__hub_perm_check__.invalid",
    account: { id: acc },
    type: "full",
  });
  if (/zone\.create|create zones|Invalid access token|Authentication/i.test(create.err)) {
    out.zoneCreate = `NO (${create.err.slice(0, 70)})`;
  } else if (/unable to identify|not a registered|invalid/i.test(create.err) || create.status === 400) {
    out.zoneCreate = "YES (perm OK; probe rejected as expected)";
  } else {
    out.zoneCreate = `${create.status} ${create.err.slice(0, 70) || "OK?"}`;
  }

  if (zone) {
    const dns = await cf(tok, "GET", `/zones/${zone.id}/dns_records?per_page=1`);
    out.dnsRead = dns.ok ? "OK" : dns.err.slice(0, 60);

    // page rules list (needed for 302)
    const pr = await cf(tok, "GET", `/zones/${zone.id}/pagerules?per_page=1`);
    out.pageRulesRead = pr.ok ? "OK" : pr.err.slice(0, 80);

    // probe page rule write without creating: PATCH nonexistent → 404 vs 403
    const prw = await cf(tok, "PATCH", `/zones/${zone.id}/pagerules/00000000000000000000000000000000`, {
      status: "disabled",
    });
    if (/403|Authentication|Unauthorized|permission/i.test(prw.err) || prw.status === 403) {
      out.pageRulesWrite = `NO (${prw.err.slice(0, 70)})`;
    } else if (prw.status === 404 || /not found|could not find|Invalid/i.test(prw.err)) {
      out.pageRulesWrite = "YES (perm OK; fake id 404)";
    } else {
      out.pageRulesWrite = `${prw.status} ${prw.err.slice(0, 60) || "OK?"}`;
    }
  } else {
    out.dnsRead = "skip";
    out.pageRulesRead = "skip";
    out.pageRulesWrite = "skip";
  }

  // Pages write probe: GET domains of first project if any
  if (pages.ok) {
    const list = await cf(tok, "GET", `/accounts/${acc}/pages/projects?per_page=1`);
    const proj = list.result?.[0]?.name;
    if (proj) {
      const doms = await cf(tok, "GET", `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains`);
      out.pagesDomainsRead = doms.ok ? `OK (${proj})` : doms.err.slice(0, 60);
    }
  }

  return out;
}

async function checkSpaceship() {
  const out = { hasKey: !!SP_KEY, hasSecret: !!SP_SEC, key: mask(SP_KEY || "") };
  if (!SP_KEY || !SP_SEC) {
    out.api = "MISSING creds";
    return out;
  }
  try {
    const r = await fetch("https://spaceship.dev/api/v1/domains?take=1&skip=0", {
      headers: {
        "X-API-Key": SP_KEY,
        "X-API-Secret": SP_SEC,
        Accept: "application/json",
      },
    });
    const t = await r.text();
    out.listDomains = r.status === 200 ? "OK" : `${r.status} ${t.slice(0, 80)}`;
  } catch (e) {
    out.listDomains = e.message;
  }
  try {
    const r = await fetch("https://spaceship.dev/api/v1/domains/gg88svip.co/available", {
      headers: {
        "X-API-Key": SP_KEY,
        "X-API-Secret": SP_SEC,
        Accept: "application/json",
      },
    });
    const j = await r.json().catch(() => ({}));
    out.checkAvailable = r.ok ? `OK (${j.result || j.domain || "ok"})` : `${r.status}`;
  } catch (e) {
    out.checkAvailable = e.message;
  }
  // get owned domain
  try {
    const r = await fetch("https://spaceship.dev/api/v1/domains/gg88svip.co", {
      headers: {
        "X-API-Key": SP_KEY,
        "X-API-Secret": SP_SEC,
        Accept: "application/json",
      },
    });
    out.getDomain = r.status === 200 ? "OK (owned)" : `${r.status}`;
  } catch (e) {
    out.getDomain = e.message;
  }
  out.note = "Buy/register needs balance — cannot prove without purchasing";
  return out;
}

console.log("primary==admin?", FREZE === ADMIN);
console.log("FREZE", await checkAccount("Freze", FREZE, FA));
console.log("ADMIN", await checkAccount("Admin", ADMIN, AA));
// cross: Freze token on Admin account pages?
console.log("CROSS FrezeTok→AdminAcc pages", await (async () => {
  const p = await cf(FREZE, "GET", `/accounts/${AA}/pages/projects?per_page=1`);
  return p.ok ? "OK" : p.err.slice(0, 80);
})());
console.log("CROSS AdminTok→FrezeAcc pages", await (async () => {
  const p = await cf(ADMIN, "GET", `/accounts/${FA}/pages/projects?per_page=1`);
  return p.ok ? "OK" : p.err.slice(0, 80);
})());
console.log("SPACESHIP", await checkSpaceship());
