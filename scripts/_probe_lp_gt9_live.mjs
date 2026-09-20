import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec("curl -sI https://lp-gg88-gt9-sk.pages.dev/ | head -5; echo '---'; curl -s https://lp-gg88-gt9-sk.pages.dev/ | head -c 400", (err, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
