import { Client } from "ssh2";
const remote = `
const u=JSON.parse(require('fs').readFileSync('/var/www/web-ten-mien/data/users.json','utf8'));
console.log(u.map(x=>({id:x.id,username:x.username,role:x.role,status:x.status})));
`;
const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d | node`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
