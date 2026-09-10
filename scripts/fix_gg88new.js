import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { checkDomainCfAccount } from '../src/repo-scanner.js';
import { addPagesDomain } from '../src/cloudflare.js';

async function fixGg88new() {
  const domain = 'gg88new.vip';
  const link = 'https://gg8830.com/?id=782414668';
  const targetCname = 'gg88-lp-5uae.pages.dev';
  const repoPath = 'C:\\Landingpage\\ldpape_4d-5-quocgia';

  console.log('1. Updating CNAME for', domain, 'to', targetCname);
  const cf = await checkDomainCfAccount(domain);
  if (cf.zone) {
    const dnsRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + cf.zone.id + '/dns_records', {
      headers: { Authorization: 'Bearer ' + cf.token }
    });
    const dns = await dnsRes.json();
    for (const r of dns.result) {
      if (r.type === 'CNAME') {
        const p = await fetch('https://api.cloudflare.com/client/v4/zones/' + cf.zone.id + '/dns_records/' + r.id, {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + cf.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'CNAME',
            name: r.name,
            content: targetCname,
            proxied: true,
            ttl: 1
          })
        });
        console.log('Updated CNAME record', r.name, ':', (await p.json()).success);
      }
    }

    // Add to Pages project gg88-lp-5uae
    try {
      const addP = await addPagesDomain(domain, 'gg88-lp-5uae');
      console.log('Added to Pages gg88-lp-5uae:', addP);
    } catch (e) {
      console.log('Pages add note:', e.message);
    }
  }

  // 2. Update domains.json in C:\Landingpage\ldpape_4d-5-quocgia
  const djPath = `${repoPath}\\domains.json`;
  let dj = JSON.parse(fs.readFileSync(djPath, 'utf8'));
  dj[domain] = { main_url: link, messenger_url: link };
  fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), 'utf8');
  console.log('Updated domains.json in', repoPath);

  // 3. Git push
  try {
    execSync('git add domains.json && git commit -m "Add gg88new.vip to 5 UAE template" && git push origin main', { cwd: repoPath, stdio: 'inherit' });
    console.log('Git pushed', repoPath);
  } catch (e) {
    console.log('Git push note:', e.message);
  }
}
fixGg88new();
