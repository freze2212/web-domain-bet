import { Client } from "ssh2";

const cmd = `
echo '=== pm2 ==='
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin)
for p in d:
  if 'session_sexy' in p['name'] or p['name']=='hall_supervisor':
    e=p['pm2_env']; print(p['name'], e.get('status'), 'up', e.get('pm_uptime'), 'rst', e.get('restart_time'), e.get('pm_exec_path'))"
echo
echo '=== NS1 last 40 ==='
tail -n 40 /root/.pm2/logs/session-sexy-1-out.log
echo
echo '=== NS2 last 40 ==='
tail -n 40 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== errors ==='
echo '-- ns1 --'; tail -n 15 /root/.pm2/logs/session-sexy-1-error.log
echo '-- ns2 --'; tail -n 15 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '=== forward counts ==='
echo -n 'NS1 FORWARD '; grep -c '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-1-out.log || true
echo -n 'NS2 FORWARD '; grep -c '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-2-out.log || true
echo -n 'NS1 MISS '; grep -c '\\[HALL MISS\\]' /root/.pm2/logs/session-sexy-1-out.log || true
echo -n 'NS2 MISS '; grep -c '\\[HALL MISS\\]' /root/.pm2/logs/session-sexy-2-out.log || true
echo -n 'NS1 skip-enter '; grep -c 'skip enter table' /root/.pm2/logs/session-sexy-1-out.log || true
echo -n 'NS2 skip-enter '; grep -c 'skip enter table' /root/.pm2/logs/session-sexy-2-out.log || true
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
