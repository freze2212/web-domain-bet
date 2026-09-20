import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  const cmd = `
cat > /tmp/run_switch_mx7.sh << 'EOF'
#!/bin/bash
cd /var/www/web-ten-mien
set -a
. ./.env
set +a
export TZ=Asia/Ho_Chi_Minh
# force line-buffered-ish via stdbuf if available
if command -v stdbuf >/dev/null; then
  exec stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1
else
  exec node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1
fi
EOF
chmod +x /tmp/run_switch_mx7.sh
: > /tmp/_switch_mx_7.log
: > /tmp/_switch_mx_7.out
rm -f /tmp/_switch_mx_7.json
setsid /tmp/run_switch_mx7.sh </dev/null >/dev/null 2>&1 &
echo LAUNCHED:$!
sleep 6
ps aux | grep '_switch_7_to_mx_git2_vps' | grep -v grep || echo NOT_RUNNING
echo '---LOG---'
cat /tmp/_switch_mx_7.log
echo '---OUT---'
head -60 /tmp/_switch_mx_7.out
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
