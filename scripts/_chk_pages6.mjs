import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequestFull, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const acc = config.cloudflare.accountId();
const want = ['gg88ip.com','gg881.co','gg88a3.com','ggtongvip.com','g88kjc.live','ggqte.com'];
const projects = await getAllPagesProjectsForAccount(acc);
const hits = [];
for (const p of projects || []) {
  try {
    const data = await cfRequestFull('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of data.result || []) {
      const n = String(d.name || '').toLowerCase();
      if (want.some(w => n === w || n === 'www.' + w || n.endsWith('.' + w))) {
        hits.push({ project: p.name, domain: d.name, status: d.status });
      }
    }
  } catch {}
}
console.log('REMAINING_PAGES', JSON.stringify(hits, null, 2));
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_pages6.mjs && node /tmp/_chk_pages6.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
