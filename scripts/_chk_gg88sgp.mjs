import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
python3 - <<'PY'
import json
from pathlib import Path
d='gg88sgp.com'
# tasks
j=json.loads(Path('data/tasks.json').read_text(encoding='utf-8'))
items=j if isinstance(j,list) else j.get('tasks') or []
hits=[t for t in items if str(t.get('domain','')).lower().replace('www.','')==d]
print('TASKS', len(hits))
for t in hits[-5:]:
  print({k:t.get(k) for k in ['id','type','status','progress','currentStep','error','createdAt','startedAt','finishedAt'] if t.get(k) is not None})
  if t.get('steps'): print(' last', t['steps'][-3:])
  if t.get('params'): print(' params', t.get('params'))
# history
h=json.loads(Path('data/history.json').read_text(encoding='utf-8'))
hh=[x for x in h if str(x.get('domain','')).lower().replace('www.','')==d]
hh=sorted(hh, key=lambda x: x.get('timestamp') or '', reverse=True)
print('HIST', len(hh))
for x in hh[:5]:
  print({k:x.get(k) for k in ['id','status','actionType','actionLabel','link','progress','error','timestamp','taskId','templateId'] if x.get(k) is not None})
PY

echo '=== LIVE / REPO ==='
node --input-type=module <<'NODE'
import fs from "fs";
import { findDomainInRepos } from "./src/repo-scanner.js";
import { getDomainOwner } from "./src/ownership.js";
const d="gg88sgp.com";
console.log("owner", getDomainOwner(d));
for (const m of findDomainInRepos(d)) {
  try {
    const j=JSON.parse(fs.readFileSync(m.filePath,"utf8"));
    const e=j[d]||j["www."+d];
    console.log("repo", m.filePath.replace("/var/www/Landingpages/",""), e?.main_url||e);
  } catch {}
}
try {
  const r=await fetch("https://"+d+"/domains.json",{headers:{"user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(15000)});
  const j=await r.json();
  const e=j[d]||j["www."+d];
  console.log("live", e?.main_url||e||"MISSING");
} catch(e) { console.log("liveErr", e.message); }
NODE

echo '=== PM2 recent ==='
pm2 logs web-tenmienbet --lines 80 --nostream 2>&1 | grep -iE 'gg88sgp|update-link|SET_LINK|updateLink' | tail -30
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
