import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(
    `
# Kill ANY leftover switch jobs from earlier (heredoc + file runner)
pkill -f '_switch_7_to_mx_git2' 2>/dev/null || true
pkill -f "switch_7_to_mx" 2>/dev/null || true
# Also kill the stuck bash heredoc if still alive
ps aux | grep -E 'gg88h\\.uk|TARGET_TPL|switch_7_to_mx|lp_gg88_mx' | grep -v grep || echo 'no matching procs'
# Show script domain list ONLY
echo '=== SCRIPT DOMAINS (must be exactly 7) ==='
grep -A20 'const domains' /var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs | head -25
echo '=== history SWITCH_TPL recent for these ==='
python3 - <<'PY'
import json
from pathlib import Path
want={'gg88h.uk','gg88k.uk','gg88top.win','gg88d.net','gg88t.net','gg88h.us','gg88t.us'}
h=json.loads(Path('/var/www/web-ten-mien/data/history.json').read_text(encoding='utf-8'))
hits=[x for x in h if str(x.get('domain','')).lower().replace('www.','') in want and x.get('actionType')=='SWITCH_TPL']
hits=sorted(hits, key=lambda x: x.get('timestamp') or '', reverse=True)[:20]
print('switch hits on target domains', len(hits))
for x in hits[:10]:
  print(x.get('timestamp'), x.get('domain'), x.get('status'), x.get('templateId'), (x.get('progress') or x.get('error') or '')[:80])
# any accidental SWITCH to mx on OTHER domains in last hour?
from datetime import datetime, timezone, timedelta
cut=(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat().replace('+00:00','Z')
bad=[]
for x in h:
  if x.get('actionType')!='SWITCH_TPL': continue
  d=str(x.get('domain','')).lower().replace('www.','')
  if d in want: continue
  if (x.get('templateId')=='lp_gg88_mx' or 'mx-git2' in str(x.get('cnameTarget') or '')) and (x.get('timestamp') or '')>=cut[:16]:
    bad.append((x.get('timestamp'), d, x.get('status')))
print('OTHER domains switched to mx last 2h:', len(bad))
for b in bad[:20]: print(b)
PY
`,
    (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d.toString()));
      s.stderr.on("data", (d) => (o += d.toString()));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
