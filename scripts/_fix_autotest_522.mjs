import { Client } from "ssh2";

const DO_FIX = process.argv.includes("--fix");
const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, ensurePagesCname, addPagesDomain, removePagesDomain } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DO_FIX = ${DO_FIX ? "true" : "false"};
const domain = 'autotest-6888.top';
const project = 'lp-gg88-gt9-git2';
const acc = config.cloudflare.accountId();

async function list() {
  const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(project)+'/domains');
  return (doms||[]).filter(d => String(d.name||'').includes('autotest'));
}

console.log('BEFORE', JSON.stringify(await list(), null, 2));

if (!DO_FIX) {
  console.log('DRY_RUN — pass --fix to re-add domains');
  process.exit(0);
}

// Remove + re-add apex/www, then set CNAME
for (const name of [domain, 'www.'+domain]) {
  try {
    await cfRequestFull('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(project)+'/domains/'+encodeURIComponent(name), { method:'DELETE' });
    console.log('DEL', name);
  } catch (e) {
    console.log('DEL_NOTE', name, e.message.slice(0,120));
  }
}

await new Promise(r => setTimeout(r, 2000));

for (const name of [domain, 'www.'+domain]) {
  try {
    const r = await cfRequestFull('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(project)+'/domains', {
      method: 'POST',
      body: { name },
    });
    console.log('ADD', name, r?.result?.status || JSON.stringify(r?.result||r).slice(0,200));
  } catch (e) {
    console.log('ADD_ERR', name, e.message.slice(0,200));
  }
}

try {
  await ensurePagesCname(domain, project + '.pages.dev');
  console.log('CNAME_OK');
} catch (e) {
  console.log('CNAME_ERR', e.message.slice(0,200));
}

// poll status
for (let i=0;i<12;i++) {
  await new Promise(r => setTimeout(r, 5000));
  const cur = await list();
  console.log('POLL', i+1, cur.map(d=>d.name+':'+d.status+(d.verification_data?.status?('/'+d.verification_data.status):'')));
  if (cur.length && cur.every(d => d.status === 'active')) break;
}
console.log('AFTER', JSON.stringify(await list(), null, 2));
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_fix_522.mjs && node /tmp/_fix_522.mjs`, (e, s) => {
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
