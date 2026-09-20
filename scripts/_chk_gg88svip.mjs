import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
from pathlib import Path
root = Path('/var/www/web-ten-mien')
needle = 'gg88svip'
hits = []
for p in root.rglob('*'):
    if not p.is_file():
        continue
    if p.suffix.lower() not in {'.json','.js','.log','.txt','.csv','.md'} and 'history' not in p.name.lower():
        continue
    try:
        if p.stat().st_size > 30_000_000:
            continue
        text = p.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    if needle in text.lower():
        hits.append(str(p))
print('FILES', len(hits))
for h in hits[:30]:
    print(h)
# extract history-like snippets
for h in hits[:10]:
    p = Path(h)
    text = p.read_text(encoding='utf-8', errors='ignore')
    idx = text.lower().find(needle)
    print('---', h)
    print(text[max(0,idx-120):idx+220].replace('\\n',' '))
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o.slice(0, 8000));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
