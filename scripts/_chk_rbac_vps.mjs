import { Client } from "ssh2";

const cmd = `python3 - <<'PY'
import json
from pathlib import Path
from collections import Counter
base = Path('/var/www/web-ten-mien/data')
for name in ['users.json','wallets.json','domain_ownership.json','domain_orders.json','domain_requests.json']:
    p = base / name
    if not p.exists():
        print(name, 'MISSING')
        continue
    d = json.loads(p.read_text(encoding='utf-8'))
    print('===', name, '===')
    if isinstance(d, list):
        print('count', len(d))
        if name == 'domain_orders.json':
            print('statuses', dict(Counter(x.get('status') for x in d)))
            for x in d[:8]:
                print(' ', x.get('domain'), x.get('status'), x.get('username'), x.get('priceXu'))
        if name == 'domain_requests.json':
            print('statuses', dict(Counter(x.get('status') for x in d)))
    elif isinstance(d, dict):
        print('entries', len(d))
        if name == 'domain_ownership.json':
            print('by user', dict(Counter(v.get('userId') for v in d.values())))
            print('ALL domains', sorted(d.keys()))
            for k, v in list(d.items())[:12]:
                print(' ', k, '->', v.get('userId'), v.get('username', ''))
        if name == 'users.json':
            for u in d:
                print(' ', u.get('id'), u.get('username'), u.get('role'), u.get('status'))
        if name == 'wallets.json':
            for k, v in d.items():
                print(' ', k, ':', v)
PY`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
