import fs from "node:fs";

const htmlPath = "C:\\Landingpage\\lp-1-page-gg88\\index.html";
let html = fs.readFileSync(htmlPath, "utf8");

const newFunc = `function getTargetUrl(config) {
            const currentHost = window.location.hostname.toLowerCase().replace(/^www\\./, '');
            const allEntries = { ...(config.domains || {}), ...(config || {}) };

            // 1. Khớp chính xác domain
            for (const [rawDomain, val] of Object.entries(allEntries)) {
                if (['defaultLink', 'autoRedirectDelay', 'domains', '_default'].includes(rawDomain)) continue;
                const cleanDom = rawDomain.toLowerCase().replace(/^www\\./, '');
                if (currentHost === cleanDom) {
                    return typeof val === 'object' ? (val.main_url || val.url || config.defaultLink) : val;
                }
            }

            // 2. Khớp theo subdomain
            for (const [rawDomain, val] of Object.entries(allEntries)) {
                if (['defaultLink', 'autoRedirectDelay', 'domains', '_default'].includes(rawDomain)) continue;
                const cleanDom = rawDomain.toLowerCase().replace(/^www\\./, '');
                if (currentHost.endsWith('.' + cleanDom)) {
                    return typeof val === 'object' ? (val.main_url || val.url || config.defaultLink) : val;
                }
            }

            // 3. Link mặc định
            return config.defaultLink || "https://gg88.com";
        }`;

html = html.replace(/function getTargetUrl\(config\)[\s\S]*?return config\.defaultLink \|\| "https:\/\/gg88\.com";\s*\}/, newFunc);
fs.writeFileSync(htmlPath, html, "utf8");
console.log("Patched index.html in lp-1-page-gg88 successfully!");
