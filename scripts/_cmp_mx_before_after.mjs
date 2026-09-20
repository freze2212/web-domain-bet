import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/Landingpages/GG88/lp-gg88-mx
echo '=== BEFORE our commits (81ffa5e) ==='
git show 81ffa5e:domains.json 2>/dev/null | python3 -c 'import sys,json; j=json.load(sys.stdin); ks=sorted(k for k in j if not k.startswith("www.")); print("count",len(ks)); print(ks); 
for k in ks: print(k, (j[k] or {}).get("main_url"))'
echo '=== NOW HEAD ==='
python3 -c 'import json; j=json.load(open("domains.json")); ks=sorted(k for k in j if not k.startswith("www.")); print("count",len(ks)); print(ks)'
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
