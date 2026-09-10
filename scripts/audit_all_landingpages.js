import fs from 'node:fs';
import path from 'node:path';

const baseDir = 'C:\\Landingpages';
const brands = fs.readdirSync(baseDir);
const report = [];

for (const brand of brands) {
  const bPath = path.join(baseDir, brand);
  if (!fs.statSync(bPath).isDirectory()) continue;
  
  const folders = fs.readdirSync(bPath);
  for (const folder of folders) {
    const fPath = path.join(bPath, folder);
    if (!fs.statSync(fPath).isDirectory()) continue;
    
    const htmlPath = path.join(fPath, 'index.html');
    const djPath = path.join(fPath, 'domains.json');
    const cfgPath = path.join(fPath, 'config.js');
    
    const hasHtml = fs.existsSync(htmlPath);
    const hasDomainsJson = fs.existsSync(djPath);
    const hasConfigJs = fs.existsSync(cfgPath);
    
    let html = hasHtml ? fs.readFileSync(htmlPath, 'utf8') : '';
    let dj = null;
    if (hasDomainsJson) {
      try { dj = JSON.parse(fs.readFileSync(djPath, 'utf8')); } catch(e) { dj = 'ERR_JSON_PARSE'; }
    }
    
    // Check dynamic script support
    const hasFetchDomainsJson = html.includes('domains.json');
    const hasConfigJsScript = html.includes('config.js') || hasConfigJs;
    const hasDynamicRouter = hasFetchDomainsJson || hasConfigJsScript || html.includes('DYNAMIC_TARGET') || html.includes('window.location.hostname');
    
    // Extract potential hardcoded target URLs
    const urlMatches = [...html.matchAll(/https?:\/\/[a-zA-Z0-9_\-\.\:\/\?\=\&\#]+/g)].map(m => m[0]);
    const filteredUrls = [...new Set(urlMatches.filter(u => 
      !u.includes('cloudflare') && 
      !u.includes('github') && 
      !u.includes('unpkg') && 
      !u.includes('jsdelivr') && 
      !u.includes('w3.org') && 
      !u.includes('fonts.googleapis') && 
      !u.includes('fonts.gstatic') &&
      !u.includes('threejs') &&
      !u.includes('vanta') &&
      !u.includes('schema.org') &&
      !u.includes('facebook.net') &&
      !u.includes('facebook.com') &&
      !u.includes('kcam.io') &&
      !u.includes('wordpress.com') &&
      !u.includes('flagcdn.com') &&
      !u.includes('soundjay.com') &&
      !u.includes('t.me') &&
      !u.includes('jsonblob.com')
    ))];
    
    report.push({
      brand,
      folder,
      hasHtml,
      hasDomainsJson,
      domainCount: dj && typeof dj === 'object' ? Object.keys(dj).length : (dj === 'ERR_JSON_PARSE' ? 'ERR' : 0),
      hasDynamicRouter,
      dynamicType: hasFetchDomainsJson ? 'domains.json' : (hasConfigJsScript ? 'config.js' : (hasDynamicRouter ? 'custom_script' : 'NONE')),
      hardcodedFallbackUrls: filteredUrls
    });
  }
}

console.log(JSON.stringify(report, null, 2));
