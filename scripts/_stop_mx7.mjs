import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`pkill -f '_switch_7_to_mx_git2_vps' 2>/dev/null; sleep 1; ps aux | grep switch_7 | grep -v grep || echo STOPPED; tail -30 /tmp/_switch_mx_7.log; echo '---json---'; cat /tmp/_switch_mx_7.json 2>/dev/null`, (e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end()});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
