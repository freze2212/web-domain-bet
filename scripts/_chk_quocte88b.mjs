import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/Landingpages/GG88/lp-gg88-mx
python3 - <<'PY'
import json
from pathlib import Path
j=json.loads(Path('domains.json').read_text())
print('has_quocte', 'quocte88.us' in j, 'www' in str([k for k in j if 'quocte' in k]))
print('apex_count', len([k for k in j if not k.startswith('www.')]))
PY
echo '=== pages custom domain ==='
cd /var/www/web-ten-mien && set -a && . ./.env && set +a
# freze account pages
ACC=456da4d89821d871fac09c0e5651338a
curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects/lp-gg88-mx-git2/domains" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import sys,json;j=json.load(sys.stdin); 
for d in j.get("result") or []:
  if "quocte" in str(d.get("name","")).lower(): print(d.get("name"), d.get("status"))'
echo '=== how LP resolves missing domain (sample JS) ==='
grep -n "domains.json\\|main_url\\|fallback\\|default" /var/www/Landingpages/GG88/lp-gg88-mx/*.js /var/www/Landingpages/GG88/lp-gg88-mx/assets/*.js 2>/dev/null | head -40
# hub domains list enrichment for this domain
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import { getEnrichedDomainsList } from "./src/domains-list-service.js";
const list = await getEnrichedDomainsList({ isAdminUser: true });
const d = (list||[]).find(x => String(x.domain||"").toLowerCase().replace(/^www\\./,"")==="quocte88.us");
console.log("HUB_ROW", d && {domain:d.domain, templateName:d.templateName, templateId:d.templateId, link:d.currentLink||d.link, cname:d.cnameTarget, source:d.sourceType, pages:d.pagesProject});
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
