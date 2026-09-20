import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { cfRequest, cfRequestFull, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAINS = ['gg88ip.com','gg881.co','gg88a3.com','ggtongvip.com','g88kjc.live','ggqte.com'];
const WANT = '160.191.87.116';

for (const domain of DOMAINS) {
  console.log('\\n====', domain, '====');
  const zone = await findZoneByName(domain);
  if (!zone) { console.log('NO_ZONE'); continue; }
  const zid = zone.id;
  const recs = await cfRequest('/zones/' + zid + '/dns_records?per_page=100');
  console.log('DNS', JSON.stringify((recs||[]).filter(r => r.name===domain || r.name==='www.'+domain).map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied}))));

  // workers routes
  try {
    const wr = await cfRequest('/zones/' + zid + '/workers/routes');
    console.log('WORKERS', JSON.stringify(wr||[]));
  } catch (e) { console.log('WORKERS_ERR', e.message); }

  // page rules
  try {
    const pr = await cfRequest('/zones/' + zid + '/pagerules');
    console.log('PAGERULES', JSON.stringify(pr||[]));
  } catch (e) { console.log('PAGERULES_ERR', e.message); }

  // Set DNS-only (grey cloud) so traffic hits origin IP directly
  for (const r of recs||[]) {
    if (!(r.name===domain || r.name==='www.'+domain)) continue;
    if (r.type !== 'A') continue;
    const body = { type:'A', name:r.name, content: WANT, proxied: false, ttl: 300 };
    try {
      const upd = await cfRequestFull('/zones/'+zid+'/dns_records/'+r.id, { method:'PUT', body });
      console.log('GREY', r.name, upd.result?.content, 'proxied='+upd.result?.proxied);
    } catch (e) {
      console.log('GREY_ERR', r.name, e.message);
    }
  }
}
console.log('\\nGREY_DONE');
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_grey6.mjs && node /tmp/_grey6.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
