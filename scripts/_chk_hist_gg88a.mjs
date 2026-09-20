import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  const cmd = `
cd /var/www/web-ten-mien
python3 - <<'PY'
import json, os
hid = "1789140982970"
domain = "gg88a.ink"
# history files
cands = []
for root, dirs, files in os.walk("data"):
  for f in files:
    if "hist" in f.lower() or "history" in f.lower() or f.endswith(".json") or f.endswith(".jsonl"):
      cands.append(os.path.join(root, f))
print("CANDS", len(cands))
for fp in cands:
  try:
    raw = open(fp, "r", encoding="utf-8", errors="ignore").read()
  except Exception as e:
    continue
  if hid not in raw and not (domain in raw and "336753649" in raw):
    continue
  print("===HIT", fp, "size", len(raw))
  if fp.endswith(".jsonl"):
    for line in raw.splitlines():
      if hid in line or (domain in line and "336753649" in line):
        print(line[:2000])
  else:
    try:
      data = json.loads(raw)
    except Exception as e:
      print("json err", e)
      continue
    items = data if isinstance(data, list) else data.get("items") or data.get("history") or data.get("entries") or []
    if isinstance(data, dict) and not items:
      # maybe keyed
      for k,v in data.items():
        if isinstance(v, dict) and (hid in str(v.get("id","")) or v.get("domain")==domain):
          print(json.dumps(v, ensure_ascii=False)[:2000])
    for it in items:
      if not isinstance(it, dict):
        continue
      if hid in str(it.get("id","")) or (it.get("domain")==domain and "336753649" in str(it.get("link",""))):
        print(json.dumps(it, ensure_ascii=False, indent=2)[:2500])
# recent in_progress for domain
print("--- recent in_progress ---")
fp = "data/history.json"
if os.path.exists(fp):
  data=json.load(open(fp,encoding="utf-8"))
  items=data if isinstance(data,list) else data.get("items") or []
  for it in items:
    if it.get("domain")==domain:
      print(it.get("id"), it.get("status"), it.get("progress") or it.get("details"), it.get("error"), it.get("createdAt") or it.get("timestamp"))
PY
echo '---LOGS---'
pm2 logs web-tenmienbet --lines 120 --nostream 2>/dev/null | grep -iE 'gg88a|1789140982970|smartSet|SSL|push Git|domains.json' | tail -50
echo '---LIVE---'
curl -sI https://gg88a.ink | head -15
curl -s https://gg88a.ink/domains.json 2>/dev/null | head -c 400; echo
`;
  c.exec(cmd, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
