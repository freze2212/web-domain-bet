import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
import {
  addPagesDomain,
  ensurePagesCname,
  deleteForwardingPageRules,
  findZoneByName,
  tokenForZone,
  waitForPagesDomainActive,
  ensureLiveDomainLink,
  cfRequest,
} from "./src/cloudflare.js";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { updateHistoryItem, getHistory } from "./src/history.js";
import { assignDomain } from "./src/ownership.js";

const domain = "gg8813.com";
const link = "https://gg8842.com/?id=854954030";
const tpl = getTemplate("lp_gg88_vip_2");
console.log("tpl", tpl.id, tpl.path, tpl.pagesProject);

const zone = await findZoneByName(domain);
if (zone) {
  await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});
}

let finalTarget = tpl.cnameTarget;
const pagesRes = await addPagesDomain(domain, tpl.pagesProject, tpl.path, {
  accountId: tpl.pagesAccountId || undefined,
});
console.log("pages", pagesRes?.projectName || pagesRes?.name, pagesRes?.canonicalSubdomain);
if (pagesRes?.canonicalSubdomain) finalTarget = pagesRes.canonicalSubdomain;
await ensurePagesCname(domain, finalTarget);
console.log("cname ->", finalTarget);

const proj = String(finalTarget).replace(/\\.pages\\.dev$/i, "");
if (pagesRes?.projectName || proj) {
  await waitForPagesDomainActive(pagesRes?.projectName || proj, domain, pagesRes?.accountId, 90000).catch((e) =>
    console.warn("wait", e.message)
  );
}

const sync = await updateTemplateDomainsJson(tpl, domain, link, link, {
  cnameTarget: finalTarget,
  pagesProject: proj,
  liveTimeoutMs: 120000,
});
console.log("liveEnsure", JSON.stringify(sync.liveEnsure));

if (zone) {
  await cfRequest("/zones/" + zone.id + "/purge_cache", {
    method: "POST",
    body: { purge_everything: true },
    token: tokenForZone(zone),
  }).catch(() => {});
}

assignDomain(domain, "u_admin", {
  mode: "LP",
  currentLink: link,
  tele: link,
  templateId: tpl.id,
  cnameTarget: finalTarget,
});

for (const h of getHistory().filter((x) => String(x.domain || "").toLowerCase() === domain)) {
  if (h.status === "in_progress" || h.actionType === "SWITCH_TPL") {
    updateHistoryItem(h.id, {
      status: sync.liveEnsure?.ok ? "success" : "failed",
      progress: null,
      link,
      tele: link,
      cnameTarget: finalTarget,
      liveStatus: sync.liveEnsure?.ok ? "200_OK" : "LINK_MISMATCH",
      error: sync.liveEnsure?.ok ? null : sync.liveEnsure?.error,
      details: { ...(h.details || {}), liveEnsure: sync.liveEnsure, fixedBy: "manual_finish_empty_dns" },
    });
    console.log("hist", h.id, "->", sync.liveEnsure?.ok ? "success" : "failed");
  }
}

await new Promise((r) => setTimeout(r, 3000));
for (const host of [domain, "www." + domain]) {
  try {
    const j = await (
      await fetch("https://" + host + "/domains.json?v=" + Date.now(), {
        headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(15000),
      })
    ).json();
    const e = j[domain] || j["www." + domain];
    console.log("VERIFY", host, e?.main_url || null);
  } catch (e) {
    console.log("VERIFY", host, "ERR", e.message);
  }
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",code=>{console.log(o);console.log("exit",code);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
