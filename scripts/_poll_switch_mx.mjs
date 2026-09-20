import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(
    `ls -la /var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs; ps aux | grep -E 'switch_7_to_mx|switch_mx' | grep -v grep; echo '---log---'; wc -l /tmp/_switch_mx_7.log /tmp/_switch_mx_7.out 2>/dev/null; tail -40 /tmp/_switch_mx_7.log 2>/dev/null; echo '---out---'; tail -40 /tmp/_switch_mx_7.out 2>/dev/null`,
    (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d.toString()));
      s.stderr.on("data", (d) => (o += d.toString()));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
