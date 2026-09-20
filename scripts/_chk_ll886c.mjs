import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { cfRequestFull } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const frezeAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
const DOMAIN = 'll886.us';
const zoneId = '7e8dcea04dc00e46608c1719e029793a';

const dns = await cfRequestFull('/zones/' + zoneId + '/dns_records?per_page=100');
const recs = (dns.result || []).filter(r => r.name === DOMAIN || r.name === 'www.' + DOMAIN || String(r.name).includes('ll886'));
console.log('DNS', JSON.stringify(recs.map(r => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied })), null, 2));

let page = 1;
const hits = [];
while (page <= 60) {
  const data = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects?page=' + page + '&per_page=10');
  for (const p of data.result || []) {
    try {
      const d = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
      for (const x of d.result || []) {
        if (String(x.name).toLowerCase() === DOMAIN || String(x.name).toLowerCase() === 'www.' + DOMAIN) {
          hits.push({ project: p.name, domain: x.name, status: x.status });
        }
      }
    } catch {}
  }
  if (page >= (data.result_info?.total_pages || 1) || !(data.result||[]).length) break;
  page++;
}
console.log('EXACT_PAGES', JSON.stringify(hits));
console.log('projects_scanned_pages', page);
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_ll886c.mjs && node /tmp/_chk_ll886c.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
