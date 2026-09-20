import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
const samples=["lltong86.com","82llwin.com","llwinkjc.top","llwin09.com"];
for (const d of samples) {
  try {
    const home=await fetch("https://"+d+"/",{headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"},signal:AbortSignal.timeout(12000)});
    const html=await home.text();
    const title=(html.match(/<title[^>]*>([^<]+)/i)||[])[1]||"";
    const logo=(html.match(/alt=[\"']([^\"']*Logo[^\"']*)[\"']/i)||[])[1]||"";
    let link=null;
    try {
      const j=await (await fetch("https://"+d+"/domains.json?v="+Date.now(),{headers:{"user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)})).json();
      const e=j[d]||j["www."+d];
      link=e?.main_url||null;
    } catch(e){ link="err:"+e.message; }
    console.log(d, "HTTP"+home.status, "title="+title.slice(0,50), "logo="+logo, "link="+link);
  } catch(e){ console.log(d, "FAIL", e.message); }
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
