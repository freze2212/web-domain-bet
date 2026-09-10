import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { checkDomainAvailability, registerDomain, resolveContactId, updateNameservers, getDomainInfo } from '../src/spaceship.js';
import { setupCloudflare, getOrCreateZone, getZoneNameservers, addPagesDomain, ensurePagesCname } from '../src/cloudflare.js';

const DOMAIN_JOBS = [
  {
    domain: '88kjc.dev',
    link: 'https://gg8830.com/?id=633886974',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'congvip.net',
    link: 'https://gg8844.com/?id=713692301',
    repoPath: 'C:\\Landingpage\\lp-1-page-gg88',
    pagesProject: 'lp-1-page-gg88',
    cnameTarget: 'lp-1-page-gg88.pages.dev'
  },
  {
    domain: 'gg8888.online',
    link: 'https://gg8845.com/?id=228010484',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'tonggg88.net',
    link: 'https://www.gg8854.com/?id=106645191',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'gtong.vip',
    link: 'https://www.gg8859.com/?id=481077178',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'ggtong.vip',
    link: 'https://www.gg8859.com/?id=481077178',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'gg8688.fun',
    link: 'https://gg8832.com/?id=258140663',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'gg8879.online',
    link: 'https://gg8846.com/?id=396051389',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'dubai88.cc',
    link: 'https://gg8849.com/?id=522087304',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'gg6886.net',
    link: 'https://www.gg8838.com/?id=771401872',
    repoPath: 'C:\\GG88\\ldpape_4d',
    pagesProject: 'lp-gg88-vip-2',
    cnameTarget: 'lp-gg88-vip-2.pages.dev'
  },
  {
    domain: 'ggdubai.online',
    link: 'https://gg8845.com/?id=484457554',
    repoPath: 'C:\\Landingpage\\lp-xoaipan-9d-g',
    pagesProject: 'lp-9d-xoaip-gg88',
    cnameTarget: 'lp-9d-xoaip-gg88.pages.dev'
  },
  {
    domain: 'gg88new.vip',
    link: 'https://gg8830.com/?id=782414668',
    repoPath: 'C:\\Landingpage\\lp-3c-gg88-fly88',
    pagesProject: 'lp-3c-gg88-fly88',
    cnameTarget: 'lp-3c-gg88-fly88.pages.dev'
  }
];

async function deployOne(job, contactId) {
  const { domain, link, repoPath, pagesProject, cnameTarget } = job;
  console.log(`\n========================================`);
  console.log(`🚀 BẮT ĐẦU XỬ LÝ: ${domain} -> ${link}`);
  console.log(`🎨 Pages Project: ${pagesProject} (${cnameTarget}) | Repo: ${repoPath}`);

  // 1. Kiểm tra & Đăng ký trên Spaceship
  let isOwned = false;
  try {
    const avail = await checkDomainAvailability(domain);
    if (avail.result === 'available') {
      console.log(`🛒 [Spaceship] Đang mua tên miền ${domain}...`);
      await registerDomain(domain, contactId);
      console.log(`✅ [Spaceship] Mua thành công ${domain}!`);
      isOwned = true;
    } else {
      console.log(`ℹ️ [Spaceship] Tên miền ${domain} đã có chủ (${avail.result}).`);
      try {
        await getDomainInfo(domain);
        isOwned = true;
      } catch {}
    }
  } catch (err) {
    console.log(`⚠️ [Spaceship Note] ${err.message}`);
  }

  // 2. Cài đặt Cloudflare Zone & DNS & Pages Custom Domain
  try {
    console.log(`☁️ [Cloudflare] Tạo Zone & kết nối DNS cho ${domain}...`);
    const cf = await setupCloudflare(domain, cnameTarget);
    console.log(`✅ [Cloudflare] Zone: ${cf.zone.id}, Status: ${cf.zone.status}`);

    if (isOwned && cf.nameservers) {
      console.log(`🔄 [Spaceship] Cập nhật Nameservers cho ${domain}...`);
      await updateNameservers(domain, cf.nameservers);
      console.log(`✅ [Spaceship] Cập nhật NS hoàn tất:`, cf.nameservers);
    }

    // Đảm bảo add vào Pages project
    try {
      await addPagesDomain(domain, pagesProject);
      console.log(`✅ [Cloudflare Pages] Đã gán custom domain ${domain} vào ${pagesProject}`);
    } catch (pe) {
      console.log(`ℹ️ [Pages Note] ${pe.message}`);
    }
  } catch (cfErr) {
    console.error(`❌ [Cloudflare Error] ${cfErr.message}`);
  }

  // 3. Cập nhật mã nguồn local
  try {
    // Nếu là repo có domains.json
    const djPath = `${repoPath}\\domains.json`;
    let dj = {};
    if (fs.existsSync(djPath)) {
      try { dj = JSON.parse(fs.readFileSync(djPath, 'utf8')); } catch {}
    }
    dj[domain] = { main_url: link, messenger_url: link };
    fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), 'utf8');

    // Nếu là repo lp-xoaipan-9d-g (có js/config.js)
    const configJsPath = `${repoPath}\\js\\config.js`;
    if (fs.existsSync(configJsPath)) {
      let cfgContent = fs.readFileSync(configJsPath, 'utf8');
      if (!cfgContent.includes(`"${domain}"`)) {
        cfgContent = cfgContent.replace(
          /linksByDomain:\s*\{/,
          `linksByDomain: {\n    "${domain}": "${link}",`
        );
        fs.writeFileSync(configJsPath, cfgContent, 'utf8');
        console.log(`✅ [Local] Đã cập nhật js/config.js cho ${domain}`);
      }
    }

    // Cũng lưu vào C:\GG88\ldpape_4d\domains.json làm backup
    const gg88Path = 'C:\\GG88\\ldpape_4d\\domains.json';
    let gg88Dj = JSON.parse(fs.readFileSync(gg88Path, 'utf8'));
    gg88Dj[domain] = { main_url: link, messenger_url: link };
    fs.writeFileSync(gg88Path, JSON.stringify(gg88Dj, null, 2), 'utf8');

    console.log(`✅ [Local] Đã cập nhật cấu hình cho ${domain}`);
  } catch (err) {
    console.error(`❌ [Local Error] ${err.message}`);
  }
}

async function main() {
  const contactId = await resolveContactId();
  console.log(`🔑 Sử dụng Spaceship Contact ID: ${contactId}`);

  for (const job of DOMAIN_JOBS) {
    await deployOne(job, contactId);
    // Nghỉ 1s giữa mỗi domain
    await new Promise(r => setTimeout(r, 1000));
  }

  // 4. Git commit & push cho tất cả các repo bị thay đổi
  const reposToPush = [
    'C:\\GG88\\ldpape_4d',
    'C:\\Landingpage\\lp-1-page-gg88',
    'C:\\Landingpage\\lp-xoaipan-9d-g',
    'C:\\Landingpage\\lp-3c-gg88-fly88'
  ];

  console.log(`\n========================================`);
  console.log(`📦 BẮT ĐẦU GIT COMMIT & PUSH TOÀN BỘ REPOS`);
  for (const r of reposToPush) {
    if (fs.existsSync(r)) {
      try {
        execSync('git add . && git commit -m "Deploy domains" && git push origin main', { cwd: r, stdio: 'inherit' });
        console.log(`✅ Git push thành công: ${r}`);
      } catch (e) {
        console.log(`ℹ️ Git push ${r}:`, e.message);
      }
    }
  }

  console.log(`\n🎉 HOÀN TẤT TẤT CẢ TÊN MIỀN!`);
}

main();
