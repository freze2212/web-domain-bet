import { Client } from "ssh2";

const cmd = `
# peek lastSessionRequestBase / URI from env and live debug once
grep -n "URI_REQUEST_DATA\\|queryInitWebGameHall" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env | head -10
echo
# inject one-shot probe via node attaching? easier: patch log once
# read recent poll lines and add debug by running a small script that uses same cookie from a playwright dump — instead curl jsession from logs
grep -E 'sessionId::|jsessionid|URI_REQUEST|lastSession' /root/.pm2/logs/session-sexy-2-out.log | tail -20
echo
# temporary enhance: print typeof/keys on next poll by sed? 
# Quick remote probe using node + axios with cookie from firefox profile if any
ls /tmp 2>/dev/null | head -5
# Find firefox profile cookies
find /tmp /root -name 'cookies.sqlite' 2>/dev/null | head -10
find /var/www/bot-keo-nhom-bcr -name '*Profile*' -type d 2>/dev/null | head -10
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
