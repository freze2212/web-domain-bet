import { Client } from "ssh2";
const cmd = `
curl -sI --max-time 15 https://gg88hg.com/ | head -12
echo '---'
curl -sS --max-time 15 https://gg88hg.com/domains.json | python3 -c 'import sys,json;j=json.load(sys.stdin); print("gg88hg.com", j.get("gg88hg.com")); print("www", j.get("www.gg88hg.com")); print("keys_has", "gg88hg.com" in j)'
`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => { console.log(o); c.end(); });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
