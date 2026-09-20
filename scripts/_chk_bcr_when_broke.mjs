import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
# after our restart 07:28 UTC = 14:28 ICT
after=[]
for l in lines:
  if '2026-09-13T07:28' in l or (l.startswith('2026-09-13T07:') and l[11:13]>='28') or l.startswith('2026-09-13T08:'):
    after.append(l)

# find last HALL FORWARD and first detach after restart
last_fwd=None
first_det=None
for l in after:
  if 'HALL FORWARD' in l: last_fwd=l
  if first_det is None and 'Frame was detached' in l: first_det=l
print('FIRST detach after restart:', first_det)
print('LAST forward after restart (overall last in file after 14:28):')
# last forward specifically
for l in reversed(after):
  if 'HALL FORWARD' in l:
    print(l); break
print('--- timeline around first detach ---')
if first_det:
  idx=None
  for i,l in enumerate(lines):
    if l==first_det:
      idx=i; break
  for l in lines[idx-15:idx+10]:
    print(l)

# count forward vs detach by minute after 14:28
from collections import Counter
fwd=Counter(); det=Counter()
for l in after:
  # 2026-09-13T07:45:xx UTC -> ICT +7
  if '2026-09-13T' not in l: continue
  t=l.split('2026-09-13T',1)[1][:5] # HH:MM UTC
  h,m=map(int,t.split(':'))
  ict=f'{(h+7)%24:02d}:{m:02d}'
  if 'HALL FORWARD' in l: fwd[ict]+=1
  if 'Frame was detached' in l: det[ict]+=1
print('\\nPer-minute ICT (only minutes with activity):')
keys=sorted(set(fwd)|set(det))
for k in keys:
  if fwd[k] or det[k]:
    print(f'  {k}  forward={fwd[k]:3d}  detach={det[k]:3d}')
PY
echo
echo 'crontab live:'
crontab -l 2>/dev/null || echo '(empty)'
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
