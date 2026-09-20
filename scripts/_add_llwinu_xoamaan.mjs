import { Client } from "ssh2";

const LINK = "https://13llwin.com/?id=585339953";
const DOMAIN = "llwinu.us";

const remote = `
set -e
cd /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin
export TZ=Asia/Ho_Chi_Minh

python3 - <<'PY'
import json, re
from pathlib import Path
from datetime import datetime, timezone

LINK = "${LINK}"
DOMAIN = "${DOMAIN}"
root = Path('.')

# 1) domains.json (hub CTA / config.js)
dj_path = root / 'domains.json'
dj = {}
if dj_path.exists():
    try:
        dj = json.loads(dj_path.read_text(encoding='utf-8') or '{}')
    except Exception:
        dj = {}
entry = {
    'main_url': LINK,
    'messenger_url': LINK,
    'telegram_url': ''
}
dj[DOMAIN] = entry
dj['www.' + DOMAIN] = dict(entry)
dj_path.write_text(json.dumps(dj, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')
print('domains.json keys', list(dj))

# 2) db_data.json domainConfigs
db_path = root / 'db_data.json'
db = json.loads(db_path.read_text(encoding='utf-8'))
db.setdefault('config', {})
db['config'].setdefault('domainConfigs', {})
db['config']['domainConfigs'][DOMAIN] = {
    'defaultHouseLink': LINK,
    'supportTelegram': db['config']['domainConfigs'].get(DOMAIN, {}).get('supportTelegram', '')
}
db['updatedAt'] = datetime.now(timezone.utc).isoformat()
db_path.write_text(json.dumps(db, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')
print('db_data domainConfigs', db['config']['domainConfigs'].get(DOMAIN))

# 3) DEFAULT_DOMAIN_CONFIGS in db.js + functions
snippet = f"""  '{DOMAIN}': {{
    defaultHouseLink: '{LINK}',
    supportTelegram: ''
  }}"""

def patch_defaults(path: Path):
    t = path.read_text(encoding='utf-8')
    if f"'{DOMAIN}'" in t and 'defaultHouseLink' in t[t.find(DOMAIN):t.find(DOMAIN)+200]:
        # replace existing
        t2 = re.sub(
            rf"'{re.escape(DOMAIN)}'\\s*:\\s*\\{{[^}}]*\\}}",
            snippet.strip(),
            t,
            count=1
        )
        path.write_text(t2, encoding='utf-8')
        print(path, 'replaced')
        return
    marker = "'xoamaquocte.vip': {"
    if marker not in t:
        raise SystemExit(f'no marker in {path}')
    # insert after xoamaquocte.vip block
    m = re.search(r"'xoamaquocte\\.vip'\\s*:\\s*\\{[^}]*\\}", t)
    if not m:
        raise SystemExit(f'block not found {path}')
    insert_at = m.end()
    t2 = t[:insert_at] + ",\\n" + snippet + t[insert_at:]
    path.write_text(t2, encoding='utf-8')
    print(path, 'inserted')

patch_defaults(root / 'assets/js/db.js')
patch_defaults(root / 'functions/api/[[route]].js')
print('PATCH_FILES_OK')
PY

echo '=== verify snippets ==='
python3 - <<'PY'
import json
print('domains', json.load(open('domains.json')))
print('db cfg', json.load(open('db_data.json'))['config'].get('domainConfigs',{}).get('llwinu.us'))
PY
grep -n "llwinu.us" assets/js/db.js functions/api/\\[\\[route\\]\\].js | head

echo '=== git commit push ==='
git add domains.json db_data.json assets/js/db.js 'functions/api/[[route]].js'
git status -sb
git -c user.email='hub@local' -c user.name='hub-bot' commit -m "$(cat <<'EOF'
Add llwinu.us domain link config for 13llwin affiliate.

EOF
)" || echo 'NO_COMMIT'
git push origin main
echo PUSH_DONE

echo '=== try live API sync ==='
# Pull current live DB then merge domainConfigs via sync if API works
curl -sS --max-time 20 -X POST 'https://lp-xoamaan-6c-llwin.pages.dev/api/sync' \
  -H 'Content-Type: application/json' \
  -d '{"config":{"domainConfigs":{"llwinu.us":{"defaultHouseLink":"https://13llwin.com/?id=585339953","supportTelegram":""}}}}' \
  | head -c 500
echo
curl -sS --max-time 15 'https://lp-xoamaan-6c-llwin.pages.dev/domains.json' | python3 -c "import sys,json; j=json.load(sys.stdin); print('live domains', j.get('llwinu.us'), j.get('www.llwinu.us'))"
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
