/**
 * Extra flows on autotest-6888: switch-template (same 5uae) + history verify link match
 */
import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const DOMAIN = "autotest-6888.top";
const CONTROLS = ["88de.top", "8tong.net", "dubai88.cc"];
const pass = process.env.VPS_PASS || "admin123@!";
const stamp = Date.now();
const linkC = `https://www.gg8824.com/?id=switch_fix_C_${stamp}`;
const failures = [];
const log = [];

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
async function probe(d) {
  const r = await fetch(`https://${d}/domains.json?v=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "Cache-Control": "no-cache", Accept: "application/json" },
  });
  const text = await r.text();
  if (text.trim().startsWith("<")) return { link: "", error: "html" };
  const j = JSON.parse(text);
  return { link: linkOf(j[d] || j[`www.${d}`]) };
}
function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, (err, stream) => {
        if (err) {
          c.end();
          return reject(err);
        }
        let out = "",
          errOut = "";
        stream.on("data", (d) => (out += d));
        stream.stderr.on("data", (d) => (errOut += d));
        stream.on("close", (code) => {
          c.end();
          resolve({ code, out, errOut });
        });
      });
    }).on("error", reject);
    c.connect({ host: "103.146.22.218", username: "root", password: pass });
  });
}

const controlBefore = {};
for (const d of CONTROLS) controlBefore[d] = await probe(d);
console.log("controls before", controlBefore);

// switch-template via importing server pieces is heavy — call updateTemplateDomainsJson path already covered.
// Exercise switch by simulating API internals on VPS: updateTemplateDomainsJson + history verify
const js = `
process.chdir('/var/www/web-ten-mien');
const { updateTemplateDomainsJson, getTemplate } = await import('file:///var/www/web-ten-mien/src/templates.js');
const { verifyHistoryItem } = await import('file:///var/www/web-ten-mien/src/verifier.js');
const { addHistoryItem, getHistory } = await import('file:///var/www/web-ten-mien/src/history.js');
const tpl = getTemplate('gg88_lp_5uae');
const link = ${JSON.stringify(linkC)};
const domain = ${JSON.stringify(DOMAIN)};
try {
  const push = await updateTemplateDomainsJson(tpl, domain, link, link);
  const hist = addHistoryItem({
    domain,
    actionType: 'SWITCH_TPL',
    actionLabel: 'Đổi Mẫu Landing Page',
    templateName: tpl.name,
    templateId: tpl.id,
    cnameTarget: 'gg88-lp-5uae-5.pages.dev',
    link,
    tele: link,
    status: 'success',
    liveStatus: 'PENDING_200',
    username: 'admin',
    userId: 'u_admin',
    details: { mode: 'landing_page', test: 'switch_same_family' }
  });
  // wait a bit for pages
  await new Promise(r => setTimeout(r, 25000));
  const v = await verifyHistoryItem(hist.id, true);
  console.log(JSON.stringify({ ok:true, pushOrigin: !!push?.gitPush?.originOk, histId: hist.id, verify: { verified: v?.verified, liveStatus: v?.updated?.liveStatus || null, error: v?.error || null } }));
} catch(e) {
  console.log(JSON.stringify({ ok:false, error: e.message }));
}
`;

const r = await ssh(`echo '${Buffer.from(js).toString("base64")}' | base64 -d > /tmp/_switch_test.mjs && node /tmp/_switch_test.mjs`);
const line = (r.out || "").trim().split("\n").filter(Boolean).pop();
let parsed;
try {
  parsed = JSON.parse(line);
} catch {
  parsed = { ok: false, error: r.out || r.errOut };
}
log.push(parsed);
console.log("switch+verify", parsed);
if (!parsed.ok || !parsed.pushOrigin) failures.push("switch_push_failed");
if (!parsed.verify?.verified) failures.push("verify_not_matched");

await new Promise((x) => setTimeout(x, 5000));
const live = await probe(DOMAIN);
console.log("live after switch", live.link);
if (norm(live.link) !== norm(linkC)) failures.push("live_switch_mismatch");

for (const d of CONTROLS) {
  const after = await probe(d);
  if (norm(after.link) !== norm(controlBefore[d].link)) failures.push("control_" + d);
  console.log("control", d, norm(after.link) === norm(controlBefore[d].link) ? "OK" : "CHANGED");
}

const report = {
  at: new Date().toISOString(),
  linkC,
  parsed,
  live,
  failures,
  pass: failures.length === 0,
};
fs.writeFileSync("data/_setlink_switch_verify_report.json", JSON.stringify(report, null, 2));
console.log("VERDICT", report.pass ? "PASS" : "FAIL", failures);
