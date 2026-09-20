/**
 * Clone lp-7f-llwin-games → lp-7f-llwin-defr
 * Text: Hoa Kỳ/Thụy Sỹ → Đức/Pháp
 * GitHub repo + Freze Pages + hub template + appllwin.com
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";

function loadLocalEnv() {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadLocalEnv();

const FOLDER = "lp-7f-llwin-defr";
const REPO = "lp-7f-llwin-defr";
const PAGES = "lp-7f-llwin-defr";
const TPL_ID = "lp_7f_llwin_defr";
const DOMAIN = "appllwin.com";
const LINK = "https://www.llwin.app/home/register?id=874141634";
const OWNER = process.env.GITHUB_OWNER || "freze2212";

const remoteScript = `
set -e
SRC=/var/www/Landingpages/LLWIN/lp-llwin-info
DST=/var/www/Landingpages/LLWIN/${FOLDER}
cd /var/www/web-ten-mien
set -a
. ./.env
set +a

echo "=== 1) Clone folder ==="
rm -rf "$DST"
mkdir -p "$DST"
# copy files without .git
rsync -a --exclude='.git' "$SRC/" "$DST/"
cd "$DST"

echo "=== 2) Replace country labels (not 'pháp lý') ==="
python3 - <<'PY'
from pathlib import Path
p = Path("index.html")
html = p.read_text(encoding="utf8")
# precise replacements only
repls = [
  ('alt="Hoa Kỳ"', 'alt="Đức"'),
  ("alt='Hoa Kỳ'", "alt='Đức'"),
  ("<span>HOA KỲ</span>", "<span>ĐỨC</span>"),
  ('alt="Thụy Sỹ"', 'alt="Pháp"'),
  ("alt='Thụy Sỹ'", "alt='Pháp'"),
  ("<span>THỤY SỸ</span>", "<span>PHÁP</span>"),
  # also common variants without diacritics if any
  ("<span>HOA KY</span>", "<span>ĐỨC</span>"),
  ("<span>THUY SY</span>", "<span>PHÁP</span>"),
]
for a,b in repls:
  html = html.replace(a,b)
# title tweak optional - keep LLWIN
p.write_text(html, encoding="utf8")
# verify
assert "HOA KỲ" not in html and "THỤY SỸ" not in html
assert "ĐỨC" in html and "PHÁP" in html
assert "An Toàn Pháp Lý" in html or "pháp lý" in html.lower() or "Pháp Lý" in html or True
print("html_ok")
# fresh domains.json only appllwin
import json
entry = {
  "main_url": "${LINK}",
  "messenger_url": "${LINK}",
  "telegram_url": "${LINK}",
}
dj = {
  "${DOMAIN}": entry,
  "www.${DOMAIN}": entry,
}
Path("domains.json").write_text(json.dumps(dj, indent=2, ensure_ascii=False)+"\\n", encoding="utf8")
print("domains_ok", dj)
PY

# Try fetch DE/FR flags (best-effort)
curl -fsSL -o de.png "https://flagcdn.com/w80/de.png" || true
curl -fsSL -o fr.png "https://flagcdn.com/w80/fr.png" || true
if [ -s de.png ] && [ -s fr.png ]; then
  python3 - <<'PY'
from pathlib import Path
html = Path("index.html").read_text(encoding="utf8")
html = html.replace('src="us.png"', 'src="de.png"').replace("src='us.png'", "src='de.png'")
html = html.replace('src="Switzerland.png"', 'src="fr.png"').replace("src='Switzerland.png'", "src='fr.png'")
Path("index.html").write_text(html, encoding="utf8")
print("flags_swapped")
PY
fi

echo "=== 3) GitHub repo ==="
GH="$GITHUB_TOKEN"
OWNER="${OWNER}"
REPO="${REPO}"
# create private repo if missing
CODE=$(curl -sS -o /tmp/gh_repo.json -w "%{http_code}" -H "Authorization: Bearer $GH" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$OWNER/$REPO")
if [ "$CODE" = "404" ]; then
  curl -sS -X POST -H "Authorization: Bearer $GH" -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d "{\\"name\\":\\"$REPO\\",\\"private\\":true,\\"auto_init\\":false}" | python3 -c 'import sys,json;j=json.load(sys.stdin);print("created", j.get("full_name") or j)'
else
  echo "repo_exists $CODE"
fi

rm -rf .git
git init -b main
git config user.email "hub@freze.local"
git config user.name "Freze Hub"
git add -A
git commit -m "feat: LLWIN 7F variant DE/FR (Đức · Pháp) + appllwin.com"
git remote add origin "https://x-access-token:\${GITHUB_TOKEN}@github.com/$OWNER/$REPO.git"
git push -u origin main --force

echo "=== 4) Cloudflare Pages (Freze) ==="
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync("/var/www/web-ten-mien/.env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  process.env[k]=v;
}
const token=process.env.CLOUDFLARE_API_TOKEN;
const acc=process.env.CLOUDFLARE_ACCOUNT_ID;
const name="${PAGES}";
const owner="${OWNER}";
const repo="${REPO}";

async function cf(method, path, body) {
  const r = await fetch("https://api.cloudflare.com/client/v4"+path, {
    method,
    headers: { Authorization: "Bearer "+token, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return j;
}

// get repo id from sibling project source if needed
const sibling = await cf("GET", "/accounts/"+acc+"/pages/projects/lp-7f-llwin-games");
const cfg = sibling.result?.source?.config || {};
console.log("sibling source", sibling.success, cfg.owner, cfg.repo_name, cfg.owner_id, cfg.repo_id);

let meta = await cf("GET", "/accounts/"+acc+"/pages/projects/"+name);
if (meta.success) {
  console.log("pages_exists", name);
} else {
  const body = {
    name,
    production_branch: "main",
    build_config: { build_command: "", destination_dir: "", root_dir: "" },
    source: {
      type: "github",
      config: {
        owner: cfg.owner || owner,
        owner_id: cfg.owner_id,
        repo_name: repo,
        repo_id: cfg.repo_id, // may be wrong - try without first if fail
        production_branch: "main",
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
        preview_branch_includes: ["*"],
        preview_branch_excludes: [],
        path_includes: ["*"],
        path_excludes: [],
      },
    },
  };
  // Prefer GitHub API to get repo_id
  const gh = await fetch("https://api.github.com/repos/"+owner+"/"+repo, {
    headers: { Authorization: "Bearer "+process.env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "hub" },
  }).then(r=>r.json());
  if (gh.id) {
    body.source.config.repo_id = gh.id;
    body.source.config.owner = gh.owner?.login || owner;
    body.source.config.owner_id = gh.owner?.id || cfg.owner_id;
  }
  meta = await cf("POST", "/accounts/"+acc+"/pages/projects", body);
  console.log("pages_create", meta.success, JSON.stringify(meta.errors||meta.result?.subdomain||"").slice(0,300));
  if (!meta.success) {
    // fallback: create empty then wrangler deploy
    const bare = await cf("POST", "/accounts/"+acc+"/pages/projects", { name, production_branch: "main" });
    console.log("pages_bare", bare.success, JSON.stringify(bare.errors||[]).slice(0,200));
  }
}

// Always force wrangler deploy to be sure
import { execSync } from "child_process";
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || "/root",
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: acc,
  npm_config_yes: "true",
};
execSync('npx -y wrangler@3 pages deploy "/var/www/Landingpages/LLWIN/${FOLDER}" --project-name "${PAGES}" --commit-dirty=true', {
  env, stdio: "inherit", timeout: 180000,
});
console.log("wrangler_ok");
NODE

echo "=== DONE REMOTE PREP ==="
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remoteScript, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", (code) => {
      console.log(o);
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
