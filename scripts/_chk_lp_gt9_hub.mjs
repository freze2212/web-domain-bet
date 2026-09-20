import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec("curl -s http://127.0.0.1:3000/api/templates | grep -o 'lp_gg88_gt9_sk[^\"]*' | head -3", (err, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o.trim() || "grep empty — try full");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
