import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json, urllib.request
need = [1789299653767, 1789299695816, 1789299735574, 1789299820289, 1789299942881]
# try list tables
urls = [
  'http://127.0.0.1:3201/predict/get-all-tables',
  'http://127.0.0.1:3201/api/get-all-tables',
  'http://127.0.0.1:3201/predict/tables',
]
for u in urls:
    try:
        d=json.loads(urllib.request.urlopen(u, timeout=5).read())
        print('URL', u, type(d), list(d)[:8] if isinstance(d,dict) else len(d) if isinstance(d,list) else d)
    except Exception as e:
        print('fail', u, e)

# brute common tables
hits=[]
for i in range(1,40):
    t=f'C{i:02d}'
    try:
        d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=4).read())
        x=d.get('table') or d
        rounds=x.get('totalRound') or []
        for r in rounds:
            st=int(r.get('stampTime') or 0)
            if st in need or any(abs(st-n)<2000 for n in need):
                hits.append((t, r.get('id'), st, r.get('roadRandom'), r.get('roadFormat'), r.get('road')))
    except Exception:
        pass
print('HITS')
for h in hits:
    print(h)

print('--- roadRandom assign ---')
import pathlib
t=pathlib.Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js').read_text(errors='replace')
i=t.find('roadRandom')
print(t[i-200:i+400] if i>=0 else 'no roadRandom in helper?')
# more
j=t.find('percentCurrent.Round')
print('--- pc ---')
print(t[j-120:j+200] if j>=0 else 'no')
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
