import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { cfRequestFull } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const frezeAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
const proj = 'gg88-lp-5uae-5';
const data = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects/' + encodeURIComponent(proj) + '/domains');
const all = data.result || [];
const hit = all.filter(d => String(d.name).toLowerCase().includes('ll886') || String(d.name).toLowerCase().includes('886.us'));
console.log('COUNT', all.length);
console.log('HITS', JSON.stringify(hit, null, 2));
console.log('SAMPLE', all.slice(0, 5).map(d => d.name + ':' + d.status));
// try add to see CF response? NO - user didn't ask to add, just verifying
// Check project exists
const p = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects/' + encodeURIComponent(proj));
console.log('PROJECT', p.result?.name, p.result?.subdomain);
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_5uae5.mjs && node /tmp/_chk_5uae5.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
