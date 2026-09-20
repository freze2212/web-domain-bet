/**
 * Deploy harden files to VPS hub + test git push flow on autotest-6888.top (5uae).
 * Saves probe before/after. Does NOT buy domain.
 */
import fs from "fs";
import { Client } from "ssh2";
import { getTemplate, updateTemplateDomainsJson } from "../src/templates.js";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pass = process.env.VPS_PASS || "admin123@!";
const domain = "autotest-6888.top";
const testLink = "https://www.gg8824.com/?id=smoke_autotest_6888_" + Date.now();

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || "";
}

async function probe(d) {
  const r = await fetch(`https://${d}/domains.json?cb=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "cache-control": "no-cache" },
  });
  const j = await r.json();
  return linkOf(j[d] || j[`www.${d}`]) || null;
}

console.log("1) Probe BEFORE", domain);
const before = await probe(domain);
console.log("   before=", before);

console.log("2) updateTemplateDomainsJson via LOCAL 5uae git (push origin)...");
const tpl = getTemplate("gg88_lp_5uae");
console.log("   path", tpl.path, "pages", tpl.pagesProject);
const result = await updateTemplateDomainsJson(tpl, domain, testLink, testLink);
console.log("   gitPush", result.gitPush);

console.log("3) Wait Pages deploy...");
await new Promise((r) => setTimeout(r, 35000));

let after = null;
for (let i = 0; i < 8; i++) {
  after = await probe(domain);
  console.log(`   probe#${i + 1}`, after);
  if (after && after.includes("smoke_autotest_6888")) break;
  await new Promise((r) => setTimeout(r, 8000));
}

const report = {
  at: new Date().toISOString(),
  domain,
  pages: "gg88-lp-5uae-5",
  before,
  pushedLink: testLink,
  after,
  ok: !!(after && after.includes("smoke_autotest_6888")),
  gitPush: result.gitPush,
};
fs.writeFileSync("data/_test_autotest_6888_push.json", JSON.stringify(report, null, 2));
console.log("RESULT", report.ok ? "PASS" : "FAIL", report);

// 4) Upload hardened templates.js to VPS hub
const templatesContent = fs.readFileSync("src/templates.js");
const b64 = templatesContent.toString("base64");
const cmd = `
set -e
cp /var/www/web-ten-mien/src/templates.js /var/www/web-ten-mien/src/templates.js.bak-$(date +%Y%m%d%H%M%S)
echo '${b64}' | base64 -d > /var/www/web-ten-mien/src/templates.js
# ensure GITHUB_TOKEN present
grep -q '^GITHUB_TOKEN=' /var/www/web-ten-mien/.env || echo 'GITHUB_TOKEN=${process.env.GITHUB_TOKEN}' >> /var/www/web-ten-mien/.env
# ensure Landingpages git credential
printf 'machine github.com\\nlogin x-access-token\\npassword %s\\n' '${process.env.GITHUB_TOKEN}' > /root/.netrc
chmod 600 /root/.netrc
pm2 restart web-tenmienbet
sleep 2
pm2 show web-tenmienbet | head -15
# verify VPS 5uae has git
git -C /var/www/Landingpages/GG88/ldpape_4d-5-quocgia rev-parse --is-inside-work-tree
git -C /var/www/Landingpages/GG88/ldpape_4d rev-parse --is-inside-work-tree
echo HUB_HARDEN_OK
`;

await new Promise((resolve, reject) => {
  const conn = new Client();
  conn
    .on("ready", () => {
      conn.exec(cmd, (e, stream) => {
        if (e) {
          reject(e);
          return;
        }
        stream.on("data", (d) => process.stdout.write(d));
        stream.stderr.on("data", (d) => process.stderr.write(d));
        stream.on("close", (c) => {
          conn.end();
          if (c) reject(new Error("ssh exit " + c));
          else resolve();
        });
      });
    })
    .on("error", reject)
    .connect({ host: "103.146.22.218", username: "root", password: pass, readyTimeout: 30000 });
});

if (!report.ok) process.exit(2);
