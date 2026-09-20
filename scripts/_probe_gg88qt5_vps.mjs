import { Client } from "ssh2";

const script = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const acc = config.cloudflare.accountId();
const projects = await getAllPagesProjectsForAccount(acc);
console.log('project count', projects.length);
let hits = 0;
for (const p of projects) {
  try {
    const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(p.name)+'/domains');
    for (const d of doms||[]) {
      const n = String(d.name||'');
      if (n.includes('gg88qt.com') || n === 'www.gg88qt.com') {
        console.log('FOUND', p.name, JSON.stringify(d));
        hits++;
      }
    }
  } catch (e) {
    console.log('err', p.name, e.message.slice(0,80));
  }
}
console.log('hits', hits);

// Also show domains on gg88-lp-5uae and -5
for (const name of ['gg88-lp-5uae','gg88-lp-5uae-5','gg88-lp-5uae-2','lp-gg88-vip-2','lp-gg88-vip']) {
  try {
    const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(name)+'/domains');
    console.log(name, 'count', (doms||[]).length, 'sample', (doms||[]).slice(0,8).map(d=>d.name+'/'+d.status));
  } catch(e) { console.log(name, e.message.slice(0,100)); }
}
`;

const b64 = Buffer.from(script).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_gg88qt5.mjs && node /tmp/_probe_gg88qt5.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", () => {
      console.log(o);
      if (err) console.error(err.slice(0, 1500));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
