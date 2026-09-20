import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json,os,glob
# peek last hall payload keys from logs or cache
cands=[
 '/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/data',
 '/var/www/tool-baccarat-v2-scratch-data',
]
for root,ds,fs in os.walk('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main'):
    if 'node_modules' in root or 'venv' in root: continue
    for f in fs:
        if 'hall' in f.lower() and f.endswith(('.json','.log')):
            print('file', os.path.join(root,f))
print('--- helperGameSexy stamps ---')
p='/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js'
if os.path.exists(p):
    import re
    t=open(p,encoding='utf-8',errors='ignore').read()
    for m in re.finditer(r'.{0,60}(stampTime|bigRoads|percentCurrent).{0,80}', t):
        print(m.group(0).replace('\\n',' ')[:160])
        print('---')
PY
# live tables from API if up
curl -sS http://127.0.0.1:3201/api/tables 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
except Exception as e:
  print('api fail',e); sys.exit()
# try shapes
if isinstance(d,dict):
  print('keys', list(d)[:20])
  items=d.get('tables') or d.get('data') or d.get('tableItems') or []
  if isinstance(items,dict):
    k=list(items)[:3]
    print('table keys', k)
    for t in k:
      x=items[t]
      if isinstance(x,dict):
        print(t,'keys',list(x)[:25])
        r=x.get('latestRound') or x.get('round') or {}
        print('  latest', r if isinstance(r,dict) else type(r))
" 2>/dev/null | head -40
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o.slice(0, 8000) || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
