import { Client } from "ssh2";
import path from "node:path";

const FILES = ["data/cf_zones_cache.json"];
const host = "103.146.22.218";
const remoteDir = "/var/www/web-ten-mien";
const conn = new Client();

function upload(sftp, localRel) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(path.resolve(localRel), `${remoteDir}/${localRel.replace(/\\/g, "/")}`, (err) =>
      err ? reject(err) : resolve(localRel)
    );
  });
}

conn
  .on("ready", () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      for (const f of FILES) console.log("UP", await upload(sftp, f));
      conn.exec(
        `cd ${remoteDir} && node --input-type=module -e "import fs from 'fs'; for (const line of fs.readFileSync('.env','utf8').split(/\\n/)){const t=line.trim();if(!t||t.startsWith('#')||!t.includes('='))continue;const i=t.indexOf('=');const k=t.slice(0,i).trim();const v=t.slice(i+1).trim();if(!(k in process.env))process.env[k]=v;} const m=await import('./src/repo-scanner.js'); const h=m.listAllDomains().find(d=>d.domain==='kjctong.net'); console.log('count',m.listAllDomains().length,'kjctong',h&&h.primaryFolder,h&&h.cfAccount);"`,
        (e2, stream) => {
          stream.on("data", (d) => process.stdout.write(d.toString()));
          stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
          stream.on("close", (code) => {
            conn.end();
            process.exit(code || 0);
          });
        }
      );
    });
  })
  .connect({ host, username: "root", password: "admin123@!" });
