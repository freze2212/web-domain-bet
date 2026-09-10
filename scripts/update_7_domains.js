import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TARGETS = [
  { domain: 'gg8tong.com', link: 'https://www.gg8824.com/?id=721192118', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' },
  { domain: 'hu88x.com', link: 'https://www.gg8859.com/?id=704458793', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' },
  { domain: 'g8tong.com', link: 'https://www.gg8846.com/?id=314723017', repo: 'C:\\Landingpage\\lp-1-page-gg88' },
  { domain: 'g8tong.cc', link: 'https://www.gg8832.com/?id=367296585', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' },
  { domain: 'hug8.vip', link: 'https://gg8824.com/?id=391896621', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' },
  { domain: 'huzb.net', link: 'https://www.gg8843.com/?id=787957871', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' },
  { domain: 'gg88ok.com', link: 'https://gg8826.com/?id=693437738', repo: 'C:\\Landingpage\\ldpape_4d-5-quocgia' }
];

async function updateAndPush() {
  const repoMap = new Map();
  for (const t of TARGETS) {
    if (!repoMap.has(t.repo)) repoMap.set(t.repo, []);
    repoMap.get(t.repo).push(t);
  }

  for (const [repoPath, items] of repoMap.entries()) {
    const djPath = repoPath + '\\domains.json';
    let dj = {};
    if (fs.existsSync(djPath)) {
      try { dj = JSON.parse(fs.readFileSync(djPath, 'utf8')); } catch {}
    }
    for (const item of items) {
      dj[item.domain] = {
        main_url: item.link,
        messenger_url: item.link
      };
      console.log('Set', item.domain, 'in', repoPath);
    }
    fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), 'utf8');

    // Git push repo
    try {
      execSync('git add domains.json && git commit -m "Update links for 7 domains" && git push origin main', { cwd: repoPath, stdio: 'inherit' });
      console.log('Git pushed', repoPath);
    } catch (e) {
      console.log('Git push repo note:', e.message);
    }
  }

  // Also update C:\GG88\ldpape_4d as well
  const gg88Path = 'C:\\GG88\\ldpape_4d\\domains.json';
  let gg88Dj = JSON.parse(fs.readFileSync(gg88Path, 'utf8'));
  for (const item of TARGETS) {
    gg88Dj[item.domain] = { main_url: item.link, messenger_url: item.link };
  }
  fs.writeFileSync(gg88Path, JSON.stringify(gg88Dj, null, 2), 'utf8');

  try {
    execSync('git add domains.json && git commit -m "Update links for 7 domains" && git push origin main', { cwd: 'C:\\GG88\\ldpape_4d', stdio: 'inherit' });
    console.log('Git pushed C:\\GG88\\ldpape_4d');
  } catch (e) {
    console.log('Git push GG88 note:', e.message);
  }
}
updateAndPush();
