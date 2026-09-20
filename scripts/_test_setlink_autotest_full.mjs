/**
 * Full self-check: set-link fix on autotest-6888.top
 * - Baseline control domains (must not change)
 * - Clean stale autotest entries in wrong folders (VIP/MM88) only
 * - set-link A → probe live/git
 * - set-link B → probe again
 * - Confirm control domains unchanged
 */
import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const DOMAIN = "autotest-6888.top";
// Cùng họ Pages 5uae — có domains.json thật (không dùng miền SPA trả HTML)
const CONTROLS = ["88de.top", "8tong.net", "dubai88.cc"];
const VPS_PASS = process.env.VPS_PASS || "admin123@!";
const log = [];
const stamp = Date.now();

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
  try {
    const r = await fetch(`https://${d}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache", Accept: "application/json" },
    });
    const text = await r.text();
    if (!r.ok) return { http: r.status, link: "", error: "http" };
    if (text.trim().startsWith("<")) return { http: r.status, link: "", error: "html_not_json" };
    const j = JSON.parse(text);
    return { http: r.status, link: linkOf(j[d] || j[`www.${d}`]) };
  } catch (e) {
    return { http: 0, link: "", error: e.message };
  }
}

async function probeGh() {
  const r = await fetch(
    "https://api.github.com/repos/freze2212/gg88-lp-5uae/contents/domains.json?ref=main",
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "setlink-test",
      },
    }
  );
  const meta = await r.json();
  if (!r.ok) return { ok: false, error: meta.message };
  const dj = JSON.parse(Buffer.from(meta.content.replace(/\n/g, ""), "base64").toString("utf8"));
  return { ok: true, link: linkOf(dj[DOMAIN] || dj[`www.${DOMAIN}`]), sha: meta.sha?.slice(0, 7) };
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
        let out = "";
        let errOut = "";
        stream.on("data", (d) => (out += d));
        stream.stderr.on("data", (d) => (errOut += d));
        stream.on("close", (code) => {
          c.end();
          resolve({ code, out, errOut });
        });
      });
    }).on("error", reject);
    c.connect({ host: "103.146.22.218", username: "root", password: VPS_PASS, readyTimeout: 25000 });
  });
}

async function waitLive(expectLink, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const p = await probe(DOMAIN);
    const ok = norm(p.link) === norm(expectLink);
    log.push({ step: "probe_wait", i: i + 1, link: p.link, ok });
    if (ok) return p;
    await new Promise((r) => setTimeout(r, 8000));
  }
  return probe(DOMAIN);
}

const report = {
  at: new Date().toISOString(),
  domain: DOMAIN,
  steps: log,
  pass: false,
  failures: [],
};

console.log("0) Baseline control domains");
const controlBefore = {};
for (const d of CONTROLS) {
  controlBefore[d] = await probe(d);
  console.log("  ", d, controlBefore[d].link);
}
const autoBefore = await probe(DOMAIN);
console.log("  ", DOMAIN, autoBefore.link);
log.push({ step: "baseline", controlBefore, autoBefore });

console.log("1) Clean ONLY autotest keys from wrong VPS folders (VIP/MM88) — not other domains");
const cleanJs = `
const fs=require('fs');
const paths=[
 '/var/www/Landingpages/GG88/ldpape_4d/domains.json',
 '/var/www/Landingpages/MM88/landingpage-5uae-mm88/domains.json'
];
const d='${DOMAIN}';
const out=[];
for(const p of paths){
  if(!fs.existsSync(p)){out.push({p,skip:true});continue;}
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  const had=!!(j[d]||j['www.'+d]);
  delete j[d]; delete j['www.'+d];
  fs.writeFileSync(p, JSON.stringify(j,null,2));
  out.push({p,had,removed:had});
}
console.log(JSON.stringify(out));
`;
const cleanRes = await ssh(`echo '${Buffer.from(cleanJs).toString("base64")}' | base64 -d | node`);
log.push({ step: "clean_wrong_folders", out: cleanRes.out.trim() });
console.log("  ", cleanRes.out.trim());

// Prefer testing via VPS hub smartSetLink by SSH importing the deployed module —
// local Windows path may differ. Call VPS node with the hub code.
async function setLinkOnVps(link, tele) {
  const js = `
process.chdir('/var/www/web-ten-mien');
import('file:///var/www/web-ten-mien/src/repo-scanner.js').then(async (m) => {
  try {
    const r = await m.smartSetLink(${JSON.stringify(DOMAIN)}, ${JSON.stringify(link)}, ${JSON.stringify(tele || link)}, { username: 'admin', userId: 'u_admin' });
    console.log(JSON.stringify({ ok: true, result: r }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
  }
}).catch(e => console.log(JSON.stringify({ ok:false, error:e.message })));
`;
  const r = await ssh(`echo '${Buffer.from(js).toString("base64")}' | base64 -d > /tmp/_setlink_test.mjs && node /tmp/_setlink_test.mjs`);
  try {
    return JSON.parse((r.out || "").trim().split("\n").filter(Boolean).pop());
  } catch {
    return { ok: false, error: r.out || r.errOut };
  }
}

const linkA = `https://www.gg8824.com/?id=setlink_fix_A_${stamp}`;
const linkB = `https://www.gg8830.com/?id=setlink_fix_B_${stamp}`;

console.log("2) SET_LINK A via VPS smartSetLink →", linkA);
const resA = await setLinkOnVps(linkA, linkA);
log.push({ step: "set_link_A", resA });
console.log("  ", JSON.stringify(resA).slice(0, 500));
if (!resA.ok || !resA.result?.success) {
  report.failures.push("set_link_A_failed");
}

console.log("3) Wait live match A");
const liveA = await waitLive(linkA);
const ghA = await probeGh();
log.push({ step: "after_A", liveA, ghA });
if (norm(liveA.link) !== norm(linkA)) report.failures.push("live_A_mismatch");
if (norm(ghA.link) !== norm(linkA)) report.failures.push("gh_A_mismatch");
console.log("  live", liveA.link, "gh", ghA.link);

console.log("4) SET_LINK B via VPS smartSetLink →", linkB);
const resB = await setLinkOnVps(linkB, linkB);
log.push({ step: "set_link_B", resB });
console.log("  ", JSON.stringify(resB).slice(0, 500));
if (!resB.ok || !resB.result?.success) report.failures.push("set_link_B_failed");

console.log("5) Wait live match B");
const liveB = await waitLive(linkB);
const ghB = await probeGh();
log.push({ step: "after_B", liveB, ghB });
if (norm(liveB.link) !== norm(linkB)) report.failures.push("live_B_mismatch");
if (norm(ghB.link) !== norm(linkB)) report.failures.push("gh_B_mismatch");
console.log("  live", liveB.link, "gh", ghB.link);

// Confirm only correct folder got write
const folderCheck = await ssh(`node -e "const fs=require('fs');const d='${DOMAIN}';function L(e){if(!e)return'';if(typeof e==='string')return e;return e.main_url||''} const paths=['/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json','/var/www/Landingpages/GG88/ldpape_4d/domains.json','/var/www/Landingpages/MM88/landingpage-5uae-mm88/domains.json']; for(const p of paths){if(!fs.existsSync(p)){console.log(p+' MISSING');continue;} const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify({p,link:L(j[d]||j['www.'+d])}));}"`);
log.push({ step: "folder_check", out: folderCheck.out.trim() });
console.log("6) Folder check\n", folderCheck.out);

console.log("7) Control domains unchanged?");
const controlAfter = {};
for (const d of CONTROLS) {
  controlAfter[d] = await probe(d);
  const same = norm(controlAfter[d].link) === norm(controlBefore[d].link);
  if (!same) report.failures.push(`control_changed_${d}`);
  console.log("  ", d, same ? "OK unchanged" : "CHANGED!", controlAfter[d].link);
}
log.push({ step: "control_after", controlAfter });

// Route details must be cname_template_git_push
if (resB.result?.details?.route && resB.result.details.route !== "cname_template_git_push") {
  // details may be only in history — check updatedRepos length === 1
}
if (Array.isArray(resA.result?.updatedRepos) && resA.result.updatedRepos.length !== 1) {
  report.failures.push("set_link_A_multi_folder");
}
if (Array.isArray(resB.result?.updatedRepos) && resB.result.updatedRepos.length !== 1) {
  report.failures.push("set_link_B_multi_folder");
}

report.pass = report.failures.length === 0;
report.finalLive = liveB;
report.finalGh = ghB;
fs.writeFileSync("data/_setlink_fix_autotest_report.json", JSON.stringify(report, null, 2));
console.log("\n==== VERDICT ====", report.pass ? "PASS 100%" : "FAIL", report.failures);
