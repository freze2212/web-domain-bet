import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`grep -n 'origin/main' /var/www/web-ten-mien/src/templates.js | head; grep -n KEEP_LINKS /var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs | head; cd /var/www/Landingpages/GG88/lp-gg88-mx && git fetch origin && git rev-parse --verify origin/main; echo main_ec:$?; git rev-parse --verify origin/master; echo master_ec:$?`, (e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end()});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
