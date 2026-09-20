import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { cfRequest, cfRequestFull, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAINS = ['gg88ip.com','gg881.co','gg88a3.com','ggtongvip.com','g88kjc.live','ggqte.com'];
for (const domain of DOMAINS) {
  const zone = await findZoneByName(domain);
  if (!zone) { console.log(domain, 'NO_ZONE'); continue; }
  const zid = zone.id;
  const recs = await cfRequest('/zones/'+zid+'/dns_records?per_page=100');
  const apex = (recs||[]).filter(r => r.name===domain || r.name==='www.'+domain);
  console.log(domain, 'dns', JSON.stringify(apex.map(r=>({type:r.type,content:r.content,proxied:r.proxied,ttl:r.ttl}))));
  try {
    const ch = await cfRequest('/zones/'+zid+'/custom_hostnames?per_page=50');
    console.log(domain, 'custom_hostnames', JSON.stringify(ch||[]));
  } catch (e) { console.log(domain, 'ch_err', e.message); }
  try {
    const ssl = await cfRequest('/zones/'+zid+'/ssl/certificate_packs?status=all');
    const packs = (ssl||[]).slice(0,5).map(p=>({type:p.type,status:p.status,hosts:p.hosts}));
    console.log(domain, 'cert_packs', JSON.stringify(packs));
  } catch (e) { console.log(domain, 'ssl_err', e.message); }
}
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_ssl6.mjs && node /tmp/_ssl6.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
