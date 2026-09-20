/**
 * Full audit gg88pr.com: GitHub + CF Pages + live + hub template
 */
import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const FT = process.env.CLOUDFLARE_API_TOKEN;
const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const D = "gg88pr.com";
const PROJ = "lp-gg88pr-git2";
const REPO = "freze2212/lp-gg88pr";

async function cf(path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${FT}` },
  });
  return r.json();
}

console.log("========== 1. GITHUB", REPO, "==========");
if (!GH) {
  console.log("NO GITHUB_TOKEN local");
} else {
  const commits = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=5`, {
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "hub-audit" },
  }).then((r) => r.json());
  if (Array.isArray(commits)) {
    for (const c of commits) {
      console.log("commit", c.sha?.slice(0, 7), c.commit?.message?.split("\n")[0], c.commit?.author?.date);
    }
  } else console.log("commits err", commits.message);

  for (const f of ["domains.json", "index.html"]) {
    const fr = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=main`, {
      headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "hub-audit" },
    });
    const fj = await fr.json();
    if (!fr.ok) {
      console.log(f, "MISSING", fj.message);
      continue;
    }
    const txt = Buffer.from(fj.content, "base64").toString("utf8");
    const hits38 = (txt.match(/gg8838/gi) || []).length;
    const hits26 = (txt.match(/gg8826/gi) || []).length;
    console.log(f, "sha", fj.sha?.slice(0, 7), "38refs", hits38, "26refs", hits26);
    if (f === "domains.json") {
      try {
        const dj = JSON.parse(txt);
        console.log("  defaultLink", dj.defaultLink ?? "(none)");
        console.log("  entry", dj[D]);
      } catch {}
    }
    if (f === "index.html") {
      const m = txt.match(/window\.REDIRECT_URL\s*=\s*["']([^"']+)["']/);
      console.log("  REDIRECT_URL", m ? m[1] : "not found");
      const m2 = txt.match(/hub-domains-json-loader/);
      console.log("  domains.json loader", m2 ? "YES" : "NO");
    }
  }
}

console.log("\n========== 2. CLOUDFLARE PAGES", PROJ, "==========");
const meta = await cf(`/accounts/${FA}/pages/projects/${encodeURIComponent(PROJ)}`);
if (!meta.success) {
  console.log("project FAIL", meta.errors?.[0]?.message);
} else {
  const p = meta.result;
  console.log("project OK", p.name, p.subdomain);
  console.log("git", p.source?.type, p.source?.config?.owner + "/" + p.source?.config?.repo_name, "branch", p.source?.config?.production_branch);
  console.log("domains on project", (p.domains || []).filter((x) => String(x).includes("gg88pr")));
}

for (const name of [D, `www.${D}`]) {
  const g = await cf(`/accounts/${FA}/pages/projects/${encodeURIComponent(PROJ)}/domains/${encodeURIComponent(name)}`);
  console.log("custom domain GET", name, g.success ? g.result?.status : g.errors?.[0]?.message);
}

const deps = await cf(`/accounts/${FA}/pages/projects/${encodeURIComponent(PROJ)}/deployments?per_page=3`);
console.log("deployments:");
for (const d of deps.result || []) {
  console.log(" ", d.id?.slice(0, 8), d.created_on, d.latest_stage?.name, d.latest_stage?.status, d.url);
}

console.log("\n========== 3. DNS ZONE", D, "==========");
const zone = await cf(`/zones?name=${D}&account.id=${FA}`);
const z = zone.result?.[0];
if (z) {
  console.log("zone", z.id, z.status);
  const dns = await cf(`/zones/${z.id}/dns_records?per_page=30`);
  for (const r of dns.result || []) {
    if (String(r.name).includes("gg88pr")) console.log(" ", r.type, r.name, "->", r.content, "proxied", r.proxied);
  }
}

console.log("\n========== 4. LIVE ==========");
for (const host of [D, `www.${D}`, `${PROJ}.pages.dev`]) {
  try {
    const dj = await fetch(`https://${host}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    const t = await dj.text();
    console.log(host, "/domains.json", dj.status, t.slice(0, 220).replace(/\s+/g, " "));
  } catch (e) {
    console.log(host, "/domains.json ERR", e.message);
  }
  try {
    const hr = await fetch(`https://${host}/?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    const html = await hr.text();
    const redir = html.match(/window\.REDIRECT_URL\s*=\s*["']([^"']+)["']/);
    const href = html.match(/redirect-link[^>]*href=["']([^"']+)["']/);
    console.log(host, "HTML REDIRECT_URL", redir?.[1] || "empty");
    console.log(host, "HTML href redirect-link", href?.[1] || "?");
    console.log(host, "HTML gg8838 count", (html.match(/gg8838/gi) || []).length, "gg8826", (html.match(/gg8826/gi) || []).length);
  } catch (e) {
    console.log(host, "HTML ERR", e.message);
  }
}

console.log("\n========== 5. HUB VPS template ==========");
const remote = `
import fs from 'fs';
const tpl = fs.readFileSync('/var/www/web-ten-mien/src/templates.js','utf8');
const m = tpl.match(/"id": "lp_gg88pr"[\\s\\S]{0,600}/);
console.log(m ? m[0] : 'lp_gg88pr NOT IN templates.js');
const p='/var/www/Landingpages/GG88/lp-gg88pr';
console.log('local path exists', fs.existsSync(p));
console.log('local .git', fs.existsSync(p+'/.git'));
if(fs.existsSync(p+'/domains.json')) {
  const dj=JSON.parse(fs.readFileSync(p+'/domains.json','utf8'));
  console.log('local domains.json entry', dj['gg88pr.com']);
  console.log('local defaultLink', dj.defaultLink);
}
if(fs.existsSync(p+'/index.html')) {
  const h=fs.readFileSync(p+'/index.html','utf8');
  const r=h.match(/REDIRECT_URL\\s*=\\s*["']([^"']+)["']/);
  console.log('local index REDIRECT_URL', r?r[1]:'?');
  console.log('local index gg8838', (h.match(/gg8838/gi)||[]).length);
}
`;

await new Promise((resolve) => {
  const c = new Client();
  c.on("ready", () => {
    c.sftp((err, sftp) => {
      const ws = sftp.createWriteStream("/tmp/_audit_gg88pr.mjs");
      ws.on("close", () => {
        c.exec("node /tmp/_audit_gg88pr.mjs", (e2, st) => {
          let o = "";
          st.on("data", (d) => (o += d));
          st.stderr.on("data", (d) => (o += d));
          st.on("close", () => {
            console.log(o);
            c.end();
            resolve();
          });
        });
      });
      ws.end(remote);
    });
  }).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
});

console.log("\n========== DONE ==========");
