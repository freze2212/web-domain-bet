import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`ps -eo pid,etime,cmd | awk '/[n]ode scripts\\/_switch_7/{print}'; echo '---'; tail -60 /tmp/_switch_mx_7.log; echo '---JSON---'; cat /tmp/_switch_mx_7.json 2>/dev/null || echo none`, (e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o||"(empty)"); c.end();});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
