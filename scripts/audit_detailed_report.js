import fs from 'node:fs';
import path from 'node:path';

const baseDir = 'C:\\Landingpages';
const brands = fs.readdirSync(baseDir);
const detailedReport = [];

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
    const jsCfgPath = path.join(fPath, 'js', 'config.js');
    
    let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
    let dj = null;
    if (fs.existsSync(djPath)) {
      try { dj = JSON.parse(fs.readFileSync(djPath, 'utf8')); } catch(e) { dj = 'ERROR'; }
    }
    
    let cfgContent = '';
    let hasCfg = false;
    if (fs.existsSync(cfgPath)) {
      cfgContent = fs.readFileSync(cfgPath, 'utf8');
      hasCfg = true;
    } else if (fs.existsSync(jsCfgPath)) {
      cfgContent = fs.readFileSync(jsCfgPath, 'utf8');
      hasCfg = true;
    }
    
    // Check how dynamic linking works
    const usesDomainsJson = html.includes('domains.json');
    const usesConfigJs = html.includes('config.js') || hasCfg;
    
    let routerStatus = 'UNKNOWN';
    if (usesDomainsJson) routerStatus = 'FETCH_DOMAINS_JSON';
    else if (usesConfigJs) routerStatus = 'JS_CONFIG_MAP';
    else routerStatus = 'NO_DYNAMIC_ROUTER';
    
    // Count configured domains
    let domainCount = 0;
    if (dj && typeof dj === 'object') {
      domainCount = Object.keys(dj).filter(k => !k.startsWith('www.')).length;
    }
    
    detailedReport.push({
      brand,
      folder,
      routerStatus,
      domainCount,
      hasDomainsJson: fs.existsSync(djPath),
      hasConfigJs: hasCfg
    });
  }
}

console.log(JSON.stringify(detailedReport, null, 2));
