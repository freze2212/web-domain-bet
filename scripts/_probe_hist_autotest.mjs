/**
 * Check hist_1789070362556_p3y6g vs live/Git for autotest-6888.top
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

const HIST_ID = "hist_1789070362556_p3y6g";
const DOMAIN = "autotest-6888.top";
const VPS_HOST = process.env.VPS_HOST || "103.146.22.218";
const VPS_PASS = process.env.VPS_PASS || "admin123@!";
const GH = process.env.GITHUB_TOKEN;

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
    c.connect({ host: VPS_HOST, port: 22, username: "root", password: VPS_PASS, readyTimeout: 25000 });
  });
}

async function probeLive(d) {
  const r = await fetch(`https://${d}/domains.json?v=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "Cache-Control": "no-cache" },
  });
  const j = await r.json();
  return {
    http: r.status,
    link: linkOf(j[d] || j[`www.${d}`]),
    entry: j[d] || j[`www.${d}`] || null,
  };
}

async function probeGh(repo) {
  const r = await fetch(`https://api.github.com/repos/freze2212/${repo}/contents/domains.json?ref=main`, {
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "probe-hist",
    },
  });
  const meta = await r.json();
  if (!r.ok) return { ok: false, status: r.status, error: meta.message };
  const dj = JSON.parse(Buffer.from(meta.content.replace(/\n/g, ""), "base64").toString("utf8"));
  return {
    ok: true,
    sha: meta.sha?.slice(0, 7),
    link: linkOf(dj[DOMAIN] || dj[`www.${DOMAIN}`]),
    entry: dj[DOMAIN] || dj[`www.${DOMAIN}`] || null,
  };
}

async function probePages(project) {
  const r = await fetch(`https://${project}.pages.dev/domains.json?v=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "Cache-Control": "no-cache" },
  });
  const j = await r.json();
  return { http: r.status, link: linkOf(j[DOMAIN] || j[`www.${DOMAIN}`]) };
}

const remoteJs = `
const fs=require('fs');
const hist=JSON.parse(fs.readFileSync('/var/www/web-ten-mien/data/history.json','utf8'));
const id='${HIST_ID}';
const domain='${DOMAIN}';
const item=hist.find(h=>h.id===id);
const recent=hist.filter(h=>h.domain===domain).slice(0,10);
function slim(h){
  return {
    id:h.id,
    createdAt:h.createdAt||h.timestamp,
    actionLabel:h.actionLabel,
    actionType:h.actionType,
    templateName:h.templateName,
    previousTemplateName:h.previousTemplateName,
    link:h.link,
    oldLink:h.oldLink||h.previousLink||(h.details&&h.details.oldLink),
    tele:h.tele,
    status:h.status,
    verifiedAt:h.verifiedAt,
    httpStatus:h.httpStatus||h.verifyHttp||(h.verify&&h.verify.status),
    cnameTarget:h.cnameTarget,
    pagesProject:h.pagesProject,
    folder:h.folder||h.templateFolder,
    details:h.details,
    steps:(h.steps||h.logs||[]).slice(-12),
    user:h.user||h.username,
    ownerId:h.ownerId||h.userId
  };
}
console.log(JSON.stringify({found:!!item,item:item?slim(item):null,recent:recent.map(slim)},null,2));
`;

const remoteB64 = Buffer.from(remoteJs).toString("base64");
const { out, errOut, code } = await ssh(`echo '${remoteB64}' | base64 -d > /tmp/_probe_hist.js && node /tmp/_probe_hist.js`);
if (code !== 0) {
  console.error("SSH fail", code, errOut);
  process.exit(1);
}
const vps = JSON.parse(out);
const item = vps.item;
const claimedLink = item?.link || "";

const live = await probeLive(DOMAIN);
const liveWww = await probeLive(`www.${DOMAIN}`).catch(() => null);
const gh = await probeGh("gg88-lp-5uae");
const pages = {
  "gg88-lp-5uae": await probePages("gg88-lp-5uae"),
  "gg88-lp-5uae-4": await probePages("gg88-lp-5uae-4"),
  "gg88-lp-5uae-5": await probePages("gg88-lp-5uae-5").catch((e) => ({ error: e.message })),
};

// VPS template domains.json if path known
const vpsFolder = await ssh(
  `node -e "const fs=require('fs');const p='/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json';if(!fs.existsSync(p)){console.log(JSON.stringify({exists:false}));process.exit(0)}const j=JSON.parse(fs.readFileSync(p,'utf8'));const e=j['${DOMAIN}']||j['www.${DOMAIN}'];const link=typeof e==='string'?e:(e&&(e.main_url||e.url||e.link)||'');console.log(JSON.stringify({exists:true,link,hasGit:fs.existsSync('/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/.git')}));"`
);
let vpsTpl = null;
try {
  vpsTpl = JSON.parse(vpsFolder.out.trim());
} catch {
  vpsTpl = { raw: vpsFolder.out, err: vpsFolder.errOut };
}

const report = {
  at: new Date().toISOString(),
  histId: HIST_ID,
  domain: DOMAIN,
  history: item,
  recentCount: vps.recent?.length || 0,
  claimedLink,
  live: {
    apex: live,
    wwwLink: liveWww?.link || null,
    matchClaimed: !!claimedLink && norm(live.link) === norm(claimedLink),
  },
  github: {
    ...gh,
    matchClaimed: !!claimedLink && norm(gh.link) === norm(claimedLink),
    matchLive: norm(gh.link) === norm(live.link),
  },
  pages,
  vpsTemplateFolder: vpsTpl,
  verdict: null,
};

if (!item) {
  report.verdict = "FAIL_HIST_NOT_FOUND_ON_VPS";
} else if (item.status === "success" && norm(live.link) === norm(claimedLink) && norm(gh.link) === norm(claimedLink)) {
  report.verdict = "PASS_LIVE_AND_GIT_MATCH_HISTORY";
} else if (item.status === "success" && norm(live.link) !== norm(claimedLink)) {
  report.verdict = "FAIL_FALSE_SUCCESS_LIVE_NOT_MATCH_CLAIMED_LINK";
} else {
  report.verdict = "CHECK_NEEDED";
}

fs.writeFileSync("data/_probe_hist_autotest_6888.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
