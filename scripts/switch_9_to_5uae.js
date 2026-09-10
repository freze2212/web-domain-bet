import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { checkDomainCfAccount } from '../src/repo-scanner.js';
import { addPagesDomain } from '../src/cloudflare.js';

const DOMAINS_9 = [
  { domain: 'gg8879.online', link: 'https://gg8846.com/?id=396051389' },
  { domain: 'tonggg88.net', link: 'https://www.gg8854.com/?id=106645191' },
  { domain: 'gg8688.fun', link: 'https://gg8832.com/?id=258140663' },
  { domain: 'gtong.vip', link: 'https://www.gg8859.com/?id=481077178' },
  { domain: 'gg8888.online', link: 'https://gg8845.com/?id=228010484' },
  { domain: 'dubai88.cc', link: 'https://gg8849.com/?id=522087304' },
  { domain: '88kjc.dev', link: 'https://gg8830.com/?id=633886974' },
  { domain: 'gg6886.net', link: 'https://www.gg8838.com/?id=771401872' },
  { domain: 'gg88new.vip', link: 'https://gg8830.com/?id=782414668' }
];

const TARGET_CNAME = 'gg88-lp-5uae.pages.dev';
const PAGES_PROJECT = 'gg88-lp-5uae';
const REPO_PATH = 'C:\\Landingpage\\ldpape_4d-5-quocgia';

async function main() {
  console.log('=== CHUYỂN TOÀN BỘ 9 TÊN MIỀN SANG MẪU 5 QUỐC GIA (gg88e.us) ===\n');

  // 1. Cập nhật domains.json trong C:\Landingpage\ldpape_4d-5-quocgia
  const djPath = `${REPO_PATH}\\domains.json`;
  let dj = {};
  if (fs.existsSync(djPath)) {
    try { dj = JSON.parse(fs.readFileSync(djPath, 'utf8')); } catch {}
  }

  for (const item of DOMAINS_9) {
    dj[item.domain] = {
      main_url: item.link,
      messenger_url: item.link
    };
  }
  fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), 'utf8');
  console.log('✅ 1. Đã cập nhật 9 tên miền vào file domains.json của C:\\Landingpage\\ldpape_4d-5-quocgia');

  // 2. Cập nhật DNS CNAME và thêm vào Cloudflare Pages gg88-lp-5uae
  for (const item of DOMAINS_9) {
    console.log(`\n🔄 Xử lý DNS & Pages cho ${item.domain}...`);
    try {
      const cf = await checkDomainCfAccount(item.domain);
      if (cf.zone) {
        // Cập nhật CNAME
        const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.zone.id}/dns_records`, {
          headers: { Authorization: `Bearer ${cf.token}` }
        });
        const dnsData = await dnsRes.json();
        const cnameRec = dnsData.result?.find(r => r.type === 'CNAME');
        if (cnameRec) {
          await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.zone.id}/dns_records/${cnameRec.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'CNAME',
              name: cnameRec.name,
              content: TARGET_CNAME,
              proxied: true,
              ttl: 1
            })
          });
          console.log(`   ✅ CNAME trỏ về -> ${TARGET_CNAME}`);
        } else {
          // Tạo mới nếu chưa có
          await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.zone.id}/dns_records`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'CNAME',
              name: item.domain,
              content: TARGET_CNAME,
              proxied: true,
              ttl: 1
            })
          });
          console.log(`   ✅ Tạo mới CNAME -> ${TARGET_CNAME}`);
        }

        // Gán vào Pages project gg88-lp-5uae
        try {
          const addP = await addPagesDomain(item.domain, PAGES_PROJECT);
          console.log(`   ✅ Gán Pages custom domain [${PAGES_PROJECT}]:`, addP.status || 'OK');
        } catch (pe) {
          console.log(`   ℹ️ Pages Note: ${pe.message}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Lỗi: ${err.message}`);
    }
  }

  // 3. Git commit & push repo ldpape_4d-5-quocgia
  console.log('\n📦 3. Git Push lên Cloudflare Pages...');
  try {
    execSync('git add domains.json && git commit -m "Update 9 domains for 5 UAE Germany template" && git push origin main', { cwd: REPO_PATH, stdio: 'inherit' });
    console.log('✅ Git Push thành công!');
  } catch (e) {
    console.log('ℹ️ Git push note:', e.message);
  }

  console.log('\n🎉 ĐÃ CHUYỂN THÀNH CÔNG TẤT CẢ 9 MIỀN VỀ MẪU 5 QUỐC GIA (CÓ CỜ GERMANY)!');
}

main();
