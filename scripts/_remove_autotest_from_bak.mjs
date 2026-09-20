/**
 * Remove only autotest-6888.top (+www) from the 5uae .bak domains.json on VPS.
 * Does NOT touch live git folder, VIP, or MM88.
 */
import { Client } from "ssh2";

const DOMAIN = "autotest-6888.top";
const BAK =
  "/var/www/Landingpages/GG88/ldpape_4d-5-quocgia.bak-20260910191922/domains.json";

const remote = `
const fs=require('fs');
const path=${JSON.stringify(BAK)};
const d=${JSON.stringify(DOMAIN)};
if(!fs.existsSync(path)){
  console.log(JSON.stringify({ok:false,error:'bak domains.json missing',path}));
  process.exit(0);
}
const before=JSON.parse(fs.readFileSync(path,'utf8'));
const had=!!(before[d]||before['www.'+d]);
const bakDir=path.replace(/\\/domains\\.json$/,'');
const stamp=Date.now();
fs.copyFileSync(path, path+'.before-remove-autotest-'+stamp);
delete before[d];
delete before['www.'+d];
fs.writeFileSync(path, JSON.stringify(before,null,2));
const after=JSON.parse(fs.readFileSync(path,'utf8'));
console.log(JSON.stringify({
  ok:true,
  path,
  hadEntry:had,
  stillHas:!!(after[d]||after['www.'+d]),
  backupCopy:path+'.before-remove-autotest-'+stamp,
  note:'Only removed domain keys from this bak file. Did not delete bak folder.'
},null,2));
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d | node`, (err, stream) => {
    if (err) throw err;
    let out = "";
    stream.on("data", (d) => (out += d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
    stream.on("close", (code) => {
      console.log(out || "(no out)");
      process.exit(code || 0);
    });
  });
}).on("error", (e) => {
  console.error(e);
  process.exit(1);
});
c.connect({
  host: "103.146.22.218",
  username: "root",
  password: "admin123@!",
  readyTimeout: 20000,
});
