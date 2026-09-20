import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
pkill -f '_switch_7_to_mx_git2_vps' 2>/dev/null || true
cd /var/www/Landingpages/GG88/lp-gg88-mx
echo '=== git status ==='
git remote -v
git branch -a
git status -sb
git log -1 --oneline 2>/dev/null
ls domains.json 2>/dev/null && python3 -c 'import json;j=json.load(open("domains.json")); print("keys", len(j), list(j)[:5])'
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end()}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
