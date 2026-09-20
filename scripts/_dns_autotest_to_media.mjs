/**
 * Point autotest-6888.top DNS to VPS media-vault (not Pages LP).
 * User confirmed LP on this domain is test-only.
 */
import { Client } from "ssh2";

const DOMAIN = "autotest-6888.top";
const VPS_IP = "103.146.22.218";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

const DOMAIN = '${DOMAIN}';
const VPS_IP = '${VPS_IP}';
const acc = config.cloudflare.accountId();

const zone = await findZoneByName(DOMAIN);
if (!zone) throw new Error('Zone not found');
console.log('ZONE', zone.id, zone.status);

const recs = await cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
const targets = new Set([DOMAIN, 'www.'+DOMAIN]);
for (const r of recs||[]) {
  if (!targets.has(r.name)) continue;
  if (!['A','AAAA','CNAME'].includes(r.type)) continue;
  console.log('DEL', r.type, r.name, r.content);
  await cfRequestFull('/zones/'+zone.id+'/dns_records/'+r.id, { method:'DELETE' });
}

for (const name of [DOMAIN, 'www.'+DOMAIN]) {
  const created = await cfRequest('/zones/'+zone.id+'/dns_records', {
    method: 'POST',
    body: { type: 'A', name, content: VPS_IP, proxied: true, ttl: 1 },
  });
  console.log('ADD A', name, '->', VPS_IP, 'proxied', created?.proxied, created?.id);
}

// Remove from Pages projects if still attached (avoid CF conflict)
for (const proj of ['lp-gg88-gt9-git2','gg88-lp-5uae-5','gg88-lp-5uae','lp-gg88-gt9']) {
  for (const name of [DOMAIN, 'www.'+DOMAIN]) {
    try {
      await cfRequestFull('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(proj)+'/domains/'+encodeURIComponent(name), { method:'DELETE' });
      console.log('PAGES_DEL', proj, name);
    } catch (e) {
      // ignore missing
    }
  }
}

console.log('DONE_DNS');
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_dns_media.mjs && node /tmp/_dns_media.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", (code) => {
      console.log(o);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
