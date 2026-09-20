import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  console.log("ready");
  c.exec("cd /var/www/Landingpages/GG88/lp-gg88-mx && git remote -v && git branch -a && git status -sb && git rev-parse --abbrev-ref HEAD && ls -la .git/refs/remotes/origin/ 2>&1 | head", (e,s)=>{
    let o="";
    s.on("data",d=>o+=d.toString());
    s.stderr.on("data",d=>o+=d.toString());
    s.on("close",code=>{console.log(o); console.log("code",code); c.end();});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
