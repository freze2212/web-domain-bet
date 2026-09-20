import { Client } from "ssh2";

const script = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, getAllPagesProjectsForAccount, getPagesProject } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const acc = config.cloudflare.accountId();
console.log('ACC', acc);
const projects = await getAllPagesProjectsForAccount(acc);
const related = (projects||[]).filter(p => /5uae|vip|gg88/i.test(p.name)).map(p=>p.name);
console.log('related projects', related.slice(0,40), 'total', related.length);

for (const name of (projects||[]).map(p=>p.name)) {
  if (!/5uae|vip-2|ldpape|gg88-lp/i.test(name)) continue;
  try {
    const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(name)+'/domains');
    const hit = (doms||[]).filter(d => String(d.name||'').includes('gg88qt') || String(d.name||'').includes('autotest-6888'));
    if (hit.length) console.log('HIT', name, hit.map(d=>({name:d.name,status:d.status,verification_data:d.verification_data})));
  } catch(e) {
    // ignore
  }
}
`;

const b64 = Buffer.from(script).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_gg88qt4.mjs && node /tmp/_probe_gg88qt4.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", () => {
      console.log(o);
      if (err) console.error(err.slice(0, 2000));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
