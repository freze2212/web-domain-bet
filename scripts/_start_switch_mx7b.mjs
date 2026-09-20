import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
# show domain count in script
node -e "const s=require('fs').readFileSync('scripts/_switch_7_to_mx_git2_vps.mjs','utf8'); const m=s.match(/const domains = \\[([\\s\\S]*?)\\]/); console.log('domains block:', m&&m[1].replace(/\\s+/g,' '))"
pkill -f '_switch_7_to_mx_git2_vps.mjs' 2>/dev/null || true
sleep 1
rm -f /tmp/_switch_mx_7.log /tmp/_switch_mx_7.out /tmp/_switch_mx_7.json
nohup node -u scripts/_switch_7_to_mx_git2_vps.mjs > /tmp/_switch_mx_7.out 2>&1 &
echo STARTED:$!
sleep 4
pgrep -af '_switch_7_to_mx_git2_vps' || echo NOT_RUNNING
echo '---LOG---'
cat /tmp/_switch_mx_7.log 2>/dev/null | head -40
echo '---OUT---'
cat /tmp/_switch_mx_7.out 2>/dev/null | head -40
`;
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o);
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
