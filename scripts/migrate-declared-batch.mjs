/**
 * Migrate declared batch: DNS-first → wait SSL/live → remove old.
 * STOP + rollback current domain on any link mismatch / hard fail.
 *
 * Usage: node scripts/migrate-declared-batch.mjs data/_migrate_batch2_declare.json
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const OLD_PROJ = "gg88-lp-5uae-2";
const NEW_PROJ = "gg88-lp-5uae-4";
const OLD_CNAME = `${OLD_PROJ}.pages.dev`;
const NEW_CNAME = `${NEW_PROJ}.pages.dev`;

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}
function norm(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "");
}

async function cf(method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [] };
}

async function probe(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, http: r.status, link: "" };
    const j = await r.json();
    const link = linkOf(j[domain] || j[`www.${domain}`]);
    return { ok: true, http: r.status, link };
  } catch (e) {
    return { ok: false, http: 0, link: "", error: e.message };
  }
}

async function getZoneAndCnames(domain) {
  const zones = await cf(
    "GET",
    `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(AID)}`
  );
  if (!zones.ok || !zones.result?.length) return { zone: null, records: [] };
  const zone = zones.result.find((z) => z.status === "active") || zones.result[0];
  const recs = await cf("GET", `/zones/${zone.id}/dns_records?type=CNAME&per_page=100`);
  const records = (recs.result || []).filter(
    (r) => r.name === domain || r.name === `www.${domain}`
  );
  return { zone, records };
}

async function setCname(zoneId, records, domain, target) {
  const out = [];
  for (const name of [domain, `www.${domain}`]) {
    const rec = records.find((r) => r.name === name);
    if (!rec) {
      out.push({ name, ok: false, error: "missing_record" });
      continue;
    }
    const patch = await cf("PATCH", `/zones/${zoneId}/dns_records/${rec.id}`, {
      type: "CNAME",
      name,
      content: target,
      proxied: true,
      ttl: 1,
    });
    out.push({ name, ok: patch.ok, content: patch.result?.content, errors: patch.errors });
  }
  return out;
}

async function addDomains(project, domain) {
  const out = [];
  for (const d of [domain, `www.${domain}`]) {
    const add = await cf("POST", `/accounts/${AID}/pages/projects/${project}/domains`, {
      name: d,
    });
    const code = add.errors?.[0]?.code;
    if (add.ok) {
      out.push({ d, ok: true, already: false, status: add.result?.status, errors: [] });
      continue;
    }
    if (code === 8000018) {
      // only OK if THIS project already has it
      const get = await cf(
        "GET",
        `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(d)}`
      );
      const onThis = get.ok && !!get.result?.status;
      out.push({
        d,
        ok: onThis,
        already: true,
        onThis,
        status: get.result?.status || null,
        errors: add.errors,
      });
      continue;
    }
    out.push({ d, ok: false, already: false, status: null, errors: add.errors });
  }
  return out;
}

async function delDomains(project, domain) {
  const out = [];
  for (const d of [domain, `www.${domain}`]) {
    const del = await cf(
      "DELETE",
      `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(d)}`
    );
    const missing = del.errors?.[0]?.code === 8000021;
    out.push({ d, ok: del.ok || missing, errors: del.errors });
  }
  return out;
}

async function pagesDomainStatus(domain) {
  const r = await cf(
    "GET",
    `/accounts/${AID}/pages/projects/${NEW_PROJ}/domains/${encodeURIComponent(domain)}`
  );
  return {
    ok: r.ok,
    status: r.result?.status || null,
    verification: r.result?.verification_data?.status || null,
    validation: r.result?.validation_data?.status || null,
  };
}

async function waitReady(domain, expectedLink, maxRounds = 36) {
  let last = null;
  let stable = 0;
  for (let i = 0; i < maxRounds; i++) {
    const st = await pagesDomainStatus(domain);
    const stw = await pagesDomainStatus(`www.${domain}`);
    const live = await probe(domain);
    const www = await probe(`www.${domain}`);
    last = { i, st, stw, live, www, stable };
    const liveOk = live.ok && norm(live.link) === norm(expectedLink);
    const wwwOk = www.ok && norm(www.link) === norm(expectedLink);
    const sslOk = st.status === "active" && stw.status === "active";
    const attached = st.ok && !!st.status;
    process.stderr.write(
      `  wait ${domain} #${i} ssl=${st.status}/${stw.status} live=${live.http} match=${liveOk} stable=${stable}\n`
    );
    if (liveOk && wwwOk && attached) {
      stable += 1;
      // Fast path: 2 vòng live đúng liên tiếp là đủ (không bắt ssl=active)
      if (stable >= 2 || sslOk) return { ok: true, last };
    } else {
      stable = 0;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, last };
}

async function rollback(domain, expectedLink) {
  process.stderr.write(`  ROLLBACK ${domain} → ${OLD_CNAME}\n`);
  const { zone, records } = await getZoneAndCnames(domain);
  if (zone) await setCname(zone.id, records, domain, OLD_CNAME);
  await delDomains(NEW_PROJ, domain);
  await addDomains(OLD_PROJ, domain);
  // refresh records after patch may need re-fetch — setCname used old ids which should still work
  let restored = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    restored = await probe(domain);
    if (restored.ok && norm(restored.link) === norm(expectedLink)) break;
  }
  return restored;
}

async function migrateOne(item) {
  const domain = item.domain;
  const expected = item.link_after_must_equal;
  const log = [];

  // preflight live
  const before = await probe(domain);
  log.push({ step: "preflight", before });
  if (!before.ok || norm(before.link) !== norm(expected)) {
    return { domain, ok: false, stop: true, reason: "preflight_mismatch", before, expected, log };
  }

  const { zone, records } = await getZoneAndCnames(domain);
  if (!zone || records.length < 1) {
    return { domain, ok: false, stop: true, reason: "no_zone_or_cname", zone, records, log };
  }

  // 1) Clear domain from sibling Pages projects (tránh 8000018 ghost), gồm OLD
  const siblings = ["gg88-lp-5uae", "gg88-lp-5uae-2", "gg88-lp-5uae-3", "gg88-lp-5uae-4"];
  const cleared = [];
  for (const proj of siblings) {
    cleared.push({ proj, result: await delDomains(proj, domain) });
  }
  log.push({ step: "clear_all_projects", cleared });

  // 2) Add to NEW — must be a real attach (not phantom already)
  const add = await addDomains(NEW_PROJ, domain);
  log.push({ step: "add_new", add });
  if (add.some((a) => !a.ok)) {
    // restore old membership before dns rollback
    await addDomains(OLD_PROJ, domain);
    const rb = await rollback(domain, expected);
    return { domain, ok: false, stop: true, reason: "add_new_fail", add, rollback: rb, log };
  }
  // If API said already but GET missing → domain stuck elsewhere
  let attached = false;
  for (let i = 0; i < 8; i++) {
    const st = await pagesDomainStatus(domain);
    if (st.ok && st.status) {
      attached = true;
      break;
    }
    // retry add once if missing
    if (i === 3) await addDomains(NEW_PROJ, domain);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!attached) {
    await addDomains(OLD_PROJ, domain);
    const rb = await rollback(domain, expected);
    return { domain, ok: false, stop: true, reason: "not_attached_on_new", add, rollback: rb, log };
  }

  // 3) DNS → new
  const dns = await setCname(zone.id, records, domain, NEW_CNAME);
  log.push({ step: "dns_to_new", dns });
  if (dns.some((d) => !d.ok)) {
    const rb = await rollback(domain, expected);
    return { domain, ok: false, stop: true, reason: "dns_patch_fail", dns, rollback: rb, log };
  }

  // 4) wait ready
  const ready = await waitReady(domain, expected);
  log.push({ step: "wait", ready: ready.last });
  if (!ready.ok) {
    const rb = await rollback(domain, expected);
    return { domain, ok: false, stop: true, reason: "wait_timeout", ready: ready.last, rollback: rb, log };
  }

  // 5) final verify (old already removed)
  await new Promise((r) => setTimeout(r, 2000));
  const final = await probe(domain);
  const finalWww = await probe(`www.${domain}`);
  log.push({ step: "final", final, finalWww });
  if (!final.ok || norm(final.link) !== norm(expected)) {
    const rb = await rollback(domain, expected);
    return { domain, ok: false, stop: true, reason: "final_mismatch", final, expected, rollback: rb, log };
  }

  return {
    domain,
    ok: true,
    link: final.link,
    cname: NEW_CNAME,
    ssl: ready.last?.st?.status,
    log,
  };
}

const declarePath = process.argv[2];
const concurrency = Math.max(1, Number(process.argv[3] || process.env.MIGRATE_CONCURRENCY || 4));
if (!declarePath) {
  console.error("Usage: node scripts/migrate-declared-batch.mjs <declare.json> [concurrency]");
  process.exit(1);
}
const declared = JSON.parse(fs.readFileSync(declarePath, "utf8"));
const results = [];

console.error(`Batch ${declared.batch_id}: ${declared.domains.length} domains, concurrency=${concurrency}`);

async function runPool(items, limit, worker) {
  const ret = new Array(items.length);
  let idx = 0;
  let stop = null;
  async function run() {
    while (idx < items.length) {
      if (stop) return;
      const my = idx++;
      const item = items[my];
      ret[my] = await worker(item, my);
      if (ret[my] && ret[my].ok === false && ret[my].stop) {
        stop = ret[my];
        return;
      }
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return { ret, stop };
}

const { ret, stop } = await runPool(declared.domains, concurrency, async (item) => {
  console.error(`\n==> ${item.domain} expect ${item.link_after_must_equal}`);
  const res = await migrateOne(item);
  if (res.ok) console.error(`OK ${item.domain} → ${res.link}`);
  else console.error(`FAIL ${item.domain} → ${res.reason}`);
  return {
    domain: res.domain,
    ok: res.ok,
    link: res.link || null,
    reason: res.reason || null,
    stop: !!res.stop,
    res,
  };
});

for (const r of ret) {
  if (r) results.push({ domain: r.domain, ok: r.ok, link: r.link, reason: r.reason, stop: r.stop });
}

if (stop) {
  const outPath = path.join("data", `_migrate_${declared.batch_id}_STOP.json`);
  fs.writeFileSync(outPath, JSON.stringify({ stoppedAt: stop.domain, res: stop.res, results }, null, 2));
  console.log(
    JSON.stringify(
      { STOP: true, domain: stop.domain, reason: stop.reason, results, saved: outPath },
      null,
      2
    )
  );
  process.exit(2);
}

const outPath = path.join("data", `_migrate_${declared.batch_id}_DONE.json`);
fs.writeFileSync(outPath, JSON.stringify({ ok: true, results, at: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ ok: true, migrated: results.length, results, saved: outPath }, null, 2));
