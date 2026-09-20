import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`for d in gg88t.net gg88h.us gg88t.us; do
  code=$(curl -sI -A 'Mozilla/5.0' --max-time 15 "https://$d/" | head -1)
  link=$(curl -sS -A 'Mozilla/5.0' --max-time 15 "https://$d/domains.json" | python3 -c "import sys,json;j=json.load(sys.stdin);d='$d';e=j.get(d)or j.get('www.'+d)or{};print(e.get('main_url'))" 2>/dev/null)
  echo "$d | $code | $link"
done`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
