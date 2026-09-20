import { Client } from "ssh2";

const cmd = `cd /var/www/web-ten-mien && ls templates 2>/dev/null | head -40; ls data 2>/dev/null | head; find /var/www/web-ten-mien -maxdepth 4 -type d -name '*gg88*vip*' 2>/dev/null; find /var/www/web-ten-mien -maxdepth 5 -name domains.json 2>/dev/null | head -30; grep -R \"tong88vip.com\" /var/www/web-ten-mien --include='domains.json' 2>/dev/null | head -10; pm2 logs web-tenmienbet --lines 80 --nostream 2>/dev/null | grep -iE 'tong88|domains.json|Switch|Git' | tail -40`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, st) => {
    if (err) throw err;
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o.slice(0, 12000));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
