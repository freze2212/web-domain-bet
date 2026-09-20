import { Client } from "ssh2";
const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";
const domain="gg88sgp.com";
const zone=await findZoneByName(domain);
console.log("zone", zone?.account?.name, zone?.id);
const recs=await cfRequest("/zones/"+zone.id+"/dns_records",{token:tokenForZone(zone)});
console.log((recs||[]).filter(r=>["A","CNAME"].includes(r.type)&&(r.name===domain||r.name==="www."+domain)).map(r=>({t:r.type,n:r.name,c:r.content})));
const acc=process.env.CLOUDFLARE_ACCOUNT_ID || "456da4d89821d871fac09c0e5651338a";
const token=process.env.CLOUDFLARE_API_TOKEN;
const candidates=["landingpage-5f-g","lp-5h-gg88","lp-gg88-vip-2","lp-gg88-vip-8","lp-gg88-mx-git2","landing-page-5f","ladpage-5f-nhannhan"];
for (const proj of candidates) {
  const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+encodeURIComponent(proj)+"/domains",{headers:{Authorization:"Bearer "+token}});
  const j=await r.json();
  const hits=(j.result||[]).filter(d=>String(d.name||"").includes("gg88sgp"));
  if (hits.length) console.log("HIT", proj, hits.map(h=>h.name+":"+h.status));
}
NODE
`;
const c=new Client();
c.on("ready",()=>c.exec(cmd,(e,s)=>{let o="";s.on("data",d=>o+=d);s.stderr.on("data",d=>o+=d);s.on("close",()=>{console.log(o);c.end();});})).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
