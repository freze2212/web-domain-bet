import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json,os
# show exact entries
files=[
'/var/www/Landingpages/GG88/ldpape_4d/domains.json',
'/var/www/Landingpages/GG88/landingPage-9d/domains.json',
'/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json',
]
for f in files:
  if not os.path.exists(f):
    print('MISSING',f); continue
  d=json.load(open(f))
  print('==',f)
  for k in ['g88.to','www.g88.to']:
    print(' ',k, '=>', d.get(k))
  print()

# count how many domains have BOTH apex and www as separate list rows pattern across all domains.json
from collections import Counter
www_only=0
apex_and_www_diff_folder=0
same_folder_both=0
pairs=[]
# map domain->folders
from pathlib import Path
mp={}
for p in Path('/var/www/Landingpages').rglob('domains.json'):
  sp=str(p)
  if '.bak' in sp or '/backup' in sp.lower(): continue
  try: dj=json.load(open(p))
  except: continue
  folder=p.parent.name
  for k in dj:
    n=k.strip().lower()
    if not n: continue
    mp.setdefault(n,set()).add(folder)

# find www keys whose apex also exists in different folder
split=[]
for k,folders in mp.items():
  if not k.startswith('www.'): continue
  apex=k[4:]
  af=mp.get(apex,set())
  if not af: 
    www_only+=1
    continue
  if folders != af:
    split.append((apex, sorted(af), sorted(folders)))
print('www-only keys (no apex in any domains.json):', www_only)
print('apex/www in DIFFERENT folders:', len(split))
for row in split[:25]:
  print(' SPLIT', row[0], 'apex@', row[1], 'www@', row[2])
print('total www keys:', sum(1 for k in mp if k.startswith('www.')))
print('total apex that also have www key somewhere:', sum(1 for k in mp if (not k.startswith('www.')) and ('www.'+k) in mp))
PY

echo '=== Pages custom domains for g88.to ==='
# try via node on server if cf available - fallback curl pages
node - <<'NODE'
import('/var/www/web-ten-mien/src/cloudflare.js').then(async (cf)=>{
  try {
    const z = await cf.findZoneByName('g88.to');
    console.log('zone', z?.id, z?.name, z?.account?.name || z?.accountName);
    const records = await cf.cfRequest('/zones/'+z.id+'/dns_records?per_page=100', {token: z.token});
    const list = records?.result || records || [];
    for (const r of list) {
      if (['A','AAAA','CNAME'].includes(r.type) && (r.name==='g88.to' || r.name==='www.g88.to' || r.name.endsWith('.g88.to')))
        console.log(r.type, r.name, '->', r.content, 'proxied', r.proxied);
    }
  } catch(e){ console.error('err', e.message); }
}).catch(e=>console.error(e));
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
