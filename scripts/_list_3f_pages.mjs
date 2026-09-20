import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
set -a; . /var/www/web-ten-mien/.env; set +a
for ACC in "$CLOUDFLARE_ACCOUNT_ID" "456da4d89821d871fac09c0e5651338a" "ddead9accc534c1eb074d2a46fffe748"; do
  echo "== $ACC =="
  for TOK in "$CLOUDFLARE_API_TOKEN" "$CLOUDFLARE_ADMIN_API_TOKEN"; do
    curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects?per_page=100" -H "Authorization: Bearer $TOK" | python3 -c '
import sys,json
j=json.load(sys.stdin)
if not j.get("success"):
  print("fail", j.get("errors"))
else:
  for p in j.get("result") or []:
    n=p.get("name","")
    if any(x in n.lower() for x in ["3f","nhan","5f-g","landingpage-5f"]):
      cfg=(p.get("source") or {}).get("config") or {}
      print(n, cfg.get("owner"), cfg.get("repo_name"), cfg.get("production_branch"))
' 2>/dev/null
  done
done
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
