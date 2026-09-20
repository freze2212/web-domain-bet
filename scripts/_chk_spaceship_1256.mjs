import { Client } from "ssh2";
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const SS_KEY = process.env.SPACESHIP_API_KEY;
const SS_SECRET = process.env.SPACESHIP_API_SECRET;

const remotePy = `
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

vn = timezone(timedelta(hours=7))
target = datetime(2026, 9, 12, 12, 56, tzinfo=vn)
lo = target - timedelta(minutes=20)
hi = target + timedelta(minutes=20)

def in_window(ts):
    if not ts: return False
    try:
        if ts.endswith('Z'): dt = datetime.fromisoformat(ts.replace('Z','+00:00'))
        else: dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        dt_vn = dt.astimezone(vn)
        return lo <= dt_vn <= hi
    except Exception as e:
        return False

print('=== WINDOW', lo.strftime('%H:%M'), '-', hi.strftime('%H:%M'), 'VN ===')

# history
p = Path('/var/www/web-ten-mien/data/history.json')
items = json.loads(p.read_text(encoding='utf-8'))
if not isinstance(items, list): items = items.get('items') or items.get('history') or []

print('\\n=== HISTORY isBuy / BUY around 12:56 ===')
for x in items:
    ts = x.get('timestamp') or x.get('createdAt') or ''
    if not in_window(ts): continue
    at = x.get('actionType') or ''
    ib = x.get('isBuy')
    if not ib and at not in ('BUY_LP','BUY_302','BUY','buy'): continue
    print(json.dumps({
        'timestamp': ts,
        'domain': x.get('domain'),
        'actionType': at,
        'actionLabel': x.get('actionLabel'),
        'status': x.get('status'),
        'price': x.get('price'),
        'username': x.get('username'),
        'templateName': x.get('templateName'),
        'error': x.get('error'),
        'details': x.get('details'),
    }, ensure_ascii=False))

print('\\n=== ALL history around 12:56 (any action) ===')
for x in items[:500]:
    ts = x.get('timestamp') or x.get('createdAt') or ''
    if not in_window(ts): continue
    print(json.dumps({
        'timestamp': ts,
        'domain': x.get('domain'),
        'actionType': x.get('actionType'),
        'actionLabel': x.get('actionLabel'),
        'status': x.get('status'),
        'isBuy': x.get('isBuy'),
        'price': x.get('price'),
        'username': x.get('username'),
    }, ensure_ascii=False))

# domain orders
op = Path('/var/www/web-ten-mien/data/domain_orders.json')
if op.exists():
    orders = json.loads(op.read_text(encoding='utf-8'))
    print('\\n=== DOMAIN ORDERS around 12:56 ===')
    for o in orders:
        ts = o.get('createdAt') or o.get('resolvedAt') or ''
        if not in_window(ts): continue
        print(json.dumps(o, ensure_ascii=False)[:800])

# wallet tx if exists
for wf in ['wallet_transactions.json','wallet.json','transactions.json']:
    wp = Path('/var/www/web-ten-mien/data') / wf
    if not wp.exists(): continue
    print('\\n===', wf, '===')
    try:
        w = json.loads(wp.read_text(encoding='utf-8'))
        rows = w if isinstance(w, list) else w.get('transactions') or w.get('items') or []
        for t in rows:
            ts = t.get('timestamp') or t.get('createdAt') or ''
            if in_window(ts):
                print(json.dumps(t, ensure_ascii=False)[:600])
    except Exception as e:
        print('err', e)
`;

const c = new Client();
c.on("ready", () => {
  c.exec(`python3 - <<'PY'\n${remotePy}\nPY`, async (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", async () => {
      console.log(o.slice(0, 12000));

      if (SS_KEY && SS_SECRET) {
        console.log("\n=== SPACESHIP recent domains (first 30) ===");
        const r = await fetch("https://spaceship.dev/api/v1/domains?take=30&skip=0", {
          headers: { "X-API-Key": SS_KEY, "X-API-Secret": SS_SECRET, Accept: "application/json" },
        });
        const j = await r.json();
        const items = j?.items || j?.data || j?.domains || (Array.isArray(j) ? j : []);
        for (const d of items.slice(0, 30)) {
          const name = d.name || d.domain || d.fqdn;
          const created = d.createdAt || d.registrationDate || d.registeredAt || d.created;
          const price = d.price || d.registrationPrice || d.purchasePrice;
          console.log(name, "| created", created, "| price", price, "| status", d.status || d.lifecycleStatus);
        }

        for (const dom of ["gg88svip.co", "gg88nb.com", "gg88pr.com"]) {
          try {
            const ar = await fetch(`https://spaceship.dev/api/v1/domains/${dom}/available`, {
              headers: { "X-API-Key": SS_KEY, "X-API-Secret": SS_SECRET },
            });
            const aj = await ar.json();
            console.log("available", dom, JSON.stringify(aj).slice(0, 200));
          } catch {}
        }
      }
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
