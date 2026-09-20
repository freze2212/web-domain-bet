import { Client } from "ssh2";
const cmd = `find /var/www -maxdepth 5 -type d -name 'lp-gg88pr*' 2>&1; echo '---'; ls /var/www/Landingpages/GG88 2>&1 | head -30; echo '---'; ls /var/www/web-ten-mien/Landingpages 2>&1 | head -15`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
