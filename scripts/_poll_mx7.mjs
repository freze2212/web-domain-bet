import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`ps aux | grep '_switch_7_to_mx_git2_vps' | grep -v grep || echo DONE; echo '---'; tail -40 /tmp/_switch_mx_7.log; echo '---json---'; cat /tmp/_switch_mx_7.json 2>/dev/null || echo nojson`, (e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end()});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
