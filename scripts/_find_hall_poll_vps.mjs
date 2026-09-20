import { Client } from "ssh2";

const cmd = `
grep -n "HALL POLL\\|Frame was detached\\|lastHallIngest\\|lastSessionProgressAt\\|IN-TABLE\\|pollInTable\\|hallPoll" /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js | head -80
echo '====='
# show functions around hall poll
grep -n "function\\|HALL POLL\\|HALL FORWARD\\|lastSessionProgressAt\\s*=" /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js | head -100
wc -l /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
wc -l /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
# diff size vs local idea - extract the poll interval block
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js')
text=p.read_text(errors='replace')
for needle in ['HALL POLL IN-TABLE','Frame was detached','lastHallIngestAt','lastSessionProgressAt']:
  print(needle, 'count=', text.count(needle))
idx=text.find('HALL POLL IN-TABLE')
print('idx', idx)
if idx>=0:
  start=max(0, text.rfind('\\n', 0, idx-500))
  # find surrounding function
  start=max(0, idx-1200)
  end=min(len(text), idx+800)
  print(text[start:end])
PY
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
