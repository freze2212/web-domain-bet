import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
import { findDomainInRepos } from "./src/repo-scanner.js";

const domains = ["gg88h.uk","gg88k.uk","gg88top.win","gg88d.net","gg88t.net","gg88h.us","gg88t.us"];

for (const d of domains) {
  const matches = findDomainInRepos(d);
  console.log("\\n##", d);
  for (const m of matches) {
    const j = JSON.parse(fs.readFileSync(m.filePath, "utf8"));
    const e = j[d] || j["www."+d];
    console.log(" local:", m.filePath);
    console.log(" localLink:", e?.main_url || e);
  }
  try {
    const live = await (await fetch("https://"+d+"/domains.json", { signal: AbortSignal.timeout(15000) })).json();
    const e = live[d] || live["www."+d];
    console.log(" liveLink:", e?.main_url || e);
  } catch (err) {
    console.log(" liveErr", err.message);
  }
}
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
