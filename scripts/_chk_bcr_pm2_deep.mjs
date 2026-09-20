import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== LOCAL VN TIME ====='
date
echo 'UTC now:'; date -u

echo
echo '===== PM2 UPTIME / RESTART around ====='
pm2 prettylist 2>/dev/null | head -5
python3 - <<'PY'
import json,subprocess,time,datetime
raw=subprocess.check_output(['pm2','jlist'],text=True)
# strip ansi if any
raw=raw.strip()
if raw[0]!='[':
  i=raw.find('[')
  raw=raw[i:]
arr=json.loads(raw)
now=time.time()*1000
for p in arr:
  env=p.get('pm2_env') or {}
  up=env.get('pm_uptime') or 0
  created=env.get('created_at')
  status=env.get('status')
  restarts=env.get('restart_time')
  uptime_s=(now-up)/1000 if up else None
  def fmt(ms):
    if not ms: return None
    return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%d %H:%M:%S UTC')
  print(f"{p.get('name')}: status={status} restarts={restarts} pid={p.get('pid')} mem={p.get('monit',{}).get('memory')} uptime_s={uptime_s:.0f if uptime_s else None} pm_uptime={fmt(up)} created={fmt(created)} exit={env.get('exit_code')} exec={env.get('pm_exec_path')} cwd={env.get('pm_cwd')}")
PY

echo
echo '===== API HEALTH curl local ====='
for u in \
  'http://127.0.0.1:3201/' \
  'http://127.0.0.1:3201/api/health' \
  'http://127.0.0.1:3201/health' \
  'http://127.0.0.1:3201/api/tables' \
  'http://127.0.0.1:3201/api/status'
 do
  echo "-- $u"
  curl -sS -m 5 -o /tmp/curl_body.txt -w 'http=%{http_code} time=%{time_total}\n' "$u" || echo CURL_FAIL
  head -c 200 /tmp/curl_body.txt; echo
done

echo
echo '===== nginx sites tip/bcr ====='
grep -RIl --include='*.conf' -E '3201|tool-baccarat|tipslot|sexy|bcr' /etc/nginx 2>/dev/null | head -20
ls /etc/nginx/sites-enabled 2>/dev/null

echo
echo '===== session_sexy_1 script CRLF ====='
file /var/www/tool-baccarat-v2-scratch-data/scripts/run-session-xvfb.sh
od -c /var/www/tool-baccarat-v2-scratch-data/scripts/run-session-xvfb.sh | head -5
pm2 show session_sexy_1 2>/dev/null | head -40
pm2 show session_sexy_2 2>/dev/null | head -40
pm2 show server_sexy 2>/dev/null | head -40

echo
echo '===== LOGS AROUND 13:58 ICT (=06:58 UTC) ====='
# server logs with timestamps
grep -E '2026-09-13 13:5[0-9]|2026-09-13 14:0|2026-09-13 06:5|2026-09-13T06:5|2026-09-13T13:5' /root/.pm2/logs/server-sexy-error-0.log 2>/dev/null | tail -40
grep -E '2026-09-13 13:5[0-9]|2026-09-13 14:0|2026-09-13 06:5|2026-09-13T06:5|2026-09-13T13:5' /root/.pm2/logs/server-sexy-out-0.log 2>/dev/null | tail -40
echo '--- session2 ---'
grep -E '2026-09-13 13:5|2026-09-13 14:0|2026-09-13T06:5|2026-09-13T13:5|Error|EADDRINUSE|crash|killed|OOM|FATAL' /root/.pm2/logs/session-sexy-2-error*.log 2>/dev/null | tail -40
grep -E '2026-09-13 13:5|2026-09-13 14:0|2026-09-13T06:5|2026-09-13T13:5' /root/.pm2/logs/session-sexy-2-out*.log 2>/dev/null | tail -20

echo
echo '===== pm2 dump restart history ====='
ls -la /root/.pm2/dump.pm2 /root/.pm2/pm2.log 2>/dev/null
grep -E '13:5[5-9]|14:0|Exited|Process.*stopped|server_sexy|session_sexy' /root/.pm2/pm2.log 2>/dev/null | tail -60

echo
echo '===== FE public domain? ====='
grep -RIn --include='*.conf' -E 'server_name|proxy_pass' /etc/nginx/sites-enabled 2>/dev/null | head -80
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
