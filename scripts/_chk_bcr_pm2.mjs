import { Client } from "ssh2";

const cmd = `
echo '===== TIME ====='
date; timedatectl | head -5
echo
echo '===== PM2 LIST ====='
pm2 list
echo
echo '===== PM2 DESCRIBE (bcr/tool/sexy related) ====='
pm2 jlist 2>/dev/null | python3 - <<'PY'
import json,sys
raw=sys.stdin.read()
try: arr=json.loads(raw)
except Exception as e:
  print('jlist parse fail',e); sys.exit(0)
for p in arr:
  name=p.get('name','')
  nl=name.lower()
  if any(x in nl for x in ['bcr','baccarat','tool','sexy','tip','session','server']):
    env=p.get('pm2_env') or {}
    print('---', name, 'id=', p.get('pm_id'))
    print(' status=', env.get('status'), 'restarts=', env.get('restart_time'), 'unstable=', env.get('unstable_restarts'))
    print(' pid=', p.get('pid'), 'uptime_ms=', env.get('pm_uptime'))
    print(' created=', env.get('created_at'), 'exit_code=', env.get('exit_code'))
    print(' script=', env.get('pm_exec_path'), 'cwd=', env.get('pm_cwd'))
    print(' args=', env.get('args'))
    print(' NODE_ENV=', (env.get('env') or {}).get('NODE_ENV'))
    print(' ports/env keys sample:', [k for k in (env.get('env') or {}) if 'PORT' in k.upper() or 'HOST' in k.upper()][:10])
PY

echo
echo '===== PM2 LOGS last (server_sexy / session / bot) ====='
for n in server_sexy session_sexy_1 session_sexy_2 bot_sexy_2; do
  echo "---- $n err ----"
  pm2 logs "$n" --err --lines 40 --nostream 2>/dev/null | tail -50
  echo "---- $n out ----"
  pm2 logs "$n" --out --lines 20 --nostream 2>/dev/null | tail -30
done

echo
echo '===== LISTENING PORTS node ====='
ss -lptn 2>/dev/null | grep -E 'node|LISTEN' | head -60
echo
echo '===== SYSTEM AROUND 13:58 ====='
journalctl --since "2026-09-13 13:50:00" --until "2026-09-13 14:20:00" -n 80 --no-pager 2>/dev/null | tail -80
echo
echo '===== dmesg OOM? ====='
dmesg -T 2>/dev/null | grep -iE 'kill|oom|out of memory' | tail -20
echo
echo '===== free / load ====='
free -h; uptime; df -h / | tail -1
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
