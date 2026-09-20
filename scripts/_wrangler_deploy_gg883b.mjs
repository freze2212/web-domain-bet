import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
set -e
cd /var/www/web-ten-mien
# load token
export $(grep -E '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=' .env | xargs)
echo token_len=\${#CLOUDFLARE_API_TOKEN} acct=\$CLOUDFLARE_ACCOUNT_ID

# check wrangler
which wrangler || npx --yes wrangler --version 2>&1 | tail -3

# cancel/ignore - deploy direct from folder
cd /var/www/Landingpages/GG88/ldpape_4d
python3 - <<'PY'
import json
j=json.load(open('domains.json'))
print('gg883b', j.get('gg883b.com'))
assert j.get('gg883b.com',{}).get('main_url','').endswith('150112380')
print('ok_local')
PY

# Prefer wrangler pages deploy to project lp-gg88-vip-8 on freze account
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID
npx --yes wrangler@3 pages deploy . --project-name=lp-gg88-vip-8 --commit-dirty=true 2>&1 | tee /tmp/wrangler_vip8.log | tail -40
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",code=>{console.log(o);console.log("exit",code);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
