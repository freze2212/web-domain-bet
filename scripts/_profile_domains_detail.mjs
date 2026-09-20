import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { getAllDomainsJsonFiles } from './src/repo-scanner.js';
import { getHistory } from './src/history.js';

const files = getAllDomainsJsonFiles();
const sized = files.map(f => ({ f, kb: Math.round(fs.statSync(f).size/1024) })).sort((a,b)=>b.kb-a.kb);
console.log('TOP files by size:');
for (const x of sized.slice(0,15)) console.log(x.kb+'KB', x.f);

let t0=performance.now();
const hist = getHistory();
console.log('history items', hist.length, 'ms', (performance.now()-t0).toFixed(0));

// time parse each file
let parseMs=0, keys=0;
for (const f of files) {
  const a=performance.now();
  try {
    const j=JSON.parse(fs.readFileSync(f,'utf8'));
    keys += Object.keys(j).length;
  } catch {}
  parseMs += performance.now()-a;
}
console.log('parse_all_ms', parseMs.toFixed(0), 'total_keys', keys);

// ownership
import { getDomainOwner } from './src/ownership.js';
t0=performance.now();
for (let i=0;i<1628;i++) getDomainOwner('example'+i+'.com');
console.log('owner_1628_ms', (performance.now()-t0).toFixed(0));
t0=performance.now();
for (let i=0;i<100;i++) getDomainOwner('gg888qt.win');
console.log('owner_100_same_ms', (performance.now()-t0).toFixed(0));
JS
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
