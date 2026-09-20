import { Client } from "ssh2";
const cmd = "test -d /var/www/Landingpages/GG88/lp-gg88pr/.git && echo HAS_GIT || echo NO_GIT; ls /var/www/Landingpages/GG88/lp-gg88pr | head -8";
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
