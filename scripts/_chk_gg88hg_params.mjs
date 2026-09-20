import { Client } from "ssh2";
const cmd = `python3 -c "import json; t=json.load(open('/var/www/web-ten-mien/data/tasks.json')); h=[x for x in t if 'gg88hg' in str(x.get('domain',''))]; print(json.dumps(h[-1].get('params'),ensure_ascii=False,indent=2)); print('type', h[-1].get('type'))"`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
