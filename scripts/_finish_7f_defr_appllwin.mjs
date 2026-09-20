import fs from "fs";
import path from "path";
import { Client } from "ssh2";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  ["src/templates.js", "/var/www/web-ten-mien/src/templates.js"],
];

function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remote, fs.readFileSync(path.join(root, local)), (err) =>
      err ? reject(err) : resolve(remote)
    );
  });
}

const c = new Client();
c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const [l, r] of files) {
      await put(sftp, l, r);
      console.log("OK", r);
    }
    c.exec(
      `pm2 restart web-tenmienbet --update-env; sleep 3
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import {
  addPagesDomain,
  ensurePagesCname,
  deleteForwardingPageRules,
  findZoneByName,
  tokenForZone,
  waitForPagesDomainActive,
  createZone,
  cfRequest,
} from "./src/cloudflare.js";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { assignDomain } from "./src/ownership.js";

const domain = "appllwin.com";
const link = "https://www.llwin.app/home/register?id=874141634";
const tpl = getTemplate("lp_7f_llwin_defr");
console.log("tpl", tpl?.id, tpl?.path, tpl?.pagesProject, tpl?.cnameTarget);

let zone = await findZoneByName(domain).catch(() => null);
if (!zone) {
  console.log("creating zone...");
  try {
    zone = await createZone(domain);
  } catch (e) {
    console.log("createZone", e.message);
    zone = await findZoneByName(domain).catch(() => null);
  }
}
console.log("zone", zone?.id, zone?.status, zone?.account?.id, zone?.name_servers);

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
console.log("cname", finalTarget);

await waitForPagesDomainActive(
  pagesRes?.projectName || "lp-7f-llwin-defr",
  domain,
  pagesRes?.accountId,
  90000
).catch((e) => console.warn("wait", e.message));

const sync = await updateTemplateDomainsJson(tpl, domain, link, link, {
  cnameTarget: finalTarget,
  pagesProject: String(finalTarget).replace(/\\.pages\\.dev$/i, ""),
  liveTimeoutMs: 120000,
});
console.log("liveEnsure", JSON.stringify(sync.liveEnsure));

assignDomain(domain, "u_admin", {
  mode: "LP",
  currentLink: link,
  tele: link,
  templateId: tpl.id,
  cnameTarget: finalTarget,
});

if (zone) {
  await cfRequest("/zones/" + zone.id + "/purge_cache", {
    method: "POST",
    body: { purge_everything: true },
    token: tokenForZone(zone),
  }).catch(() => {});
}

await new Promise((r) => setTimeout(r, 4000));
for (const host of [domain, "www." + domain, "lp-7f-llwin-defr.pages.dev"]) {
  try {
    const html = await (await fetch("https://" + host + "/", { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) })).text();
    const hasDE = /ĐỨC|Đức/.test(html);
    const hasFR = />\\s*PHÁP\\s*</.test(html) || /alt=\"Pháp\"/.test(html);
    const hasUS = /HOA KỲ/.test(html);
    const hasCH = /THỤY SỸ/.test(html);
    let linkLive = null;
    try {
      const j = await (await fetch("https://" + host + "/domains.json?v=" + Date.now(), { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) })).json();
      linkLive = (j[domain] || j["www." + domain])?.main_url || null;
    } catch (e) {
      linkLive = "err:" + e.message;
    }
    console.log("VERIFY", host, { hasDE, hasFR, hasUS, hasCH, linkLive });
  } catch (e) {
    console.log("VERIFY", host, e.message);
  }
}
NODE`,
      (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          console.log(o);
          c.end();
        });
      }
    );
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
