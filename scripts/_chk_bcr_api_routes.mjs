import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== nginx toolbcr79 ====='
ls -la /etc/nginx/sites-enabled/toolbcr79* /etc/nginx/sites-available/toolbcr79* 2>/dev/null
cat /etc/nginx/sites-enabled/toolbcr79 2>/dev/null || cat /etc/nginx/sites-available/toolbcr79 2>/dev/null
echo
echo '===== find API routes in server ====='
grep -RIn --include='*.js' -E "app\\.(get|post|use)\\(|router\\.(get|post)|'/api" /var/www/tool-baccarat-v2-scratch-data/server.js /var/www/tool-baccarat-v2-scratch-data/routes 2>/dev/null | head -60
echo
echo '===== PORT / ENV ====='
grep -nE 'listen|PORT|3201' /var/www/tool-baccarat-v2-scratch-data/server.js 2>/dev/null | head -20
pm2 env 0 2>/dev/null | grep -iE 'PORT|HOST|NODE' | head -20

echo
echo '===== probe common endpoints ====='
for u in \
  'http://127.0.0.1:3201/api/fe/tables' \
  'http://127.0.0.1:3201/api/fe/status' \
  'http://127.0.0.1:3201/api/signal' \
  'http://127.0.0.1:3201/api/signals' \
  'http://127.0.0.1:3201/api/main/ho' \
  'http://127.0.0.1:3201/api/bot/status' \
  'http://127.0.0.1:3201/api/session/status' \
  'http://127.0.0.1:3201/api/ns2/status' \
  'http://127.0.0.1:3201/fe' \
  'http://127.0.0.1:3201/socket.io/?EIO=4&transport=polling'
 do
  code=$(curl -sS -m 4 -o /tmp/b.txt -w '%{http_code}' "$u" || echo ERR)
  echo "$code $u | $(head -c 120 /tmp/b.txt | tr '\\n' ' ')"
done

echo
echo '===== public curl toolbcr ====='
# try resolve from nginx server_name
SN=$(grep -R server_name /etc/nginx/sites-enabled/toolbcr79* 2>/dev/null | head -1)
echo "server_name line: $SN"
DOM=$(grep -RhoE 'server_name[[:space:]]+[^;]+' /etc/nginx/sites-enabled/toolbcr79 2>/dev/null | head -1 | sed 's/server_name//' | awk '{print $1}')
echo "DOM=$DOM"
if [ -n "$DOM" ]; then
  curl -sS -m 8 -o /tmp/pub.txt -w "https=$DOM http=%{http_code} time=%{time_total}\\n" "https://$DOM/" || true
  head -c 200 /tmp/pub.txt; echo
  curl -sS -m 8 -o /tmp/pub2.txt -w "api_probe http=%{http_code}\\n" "https://$DOM/api/fe/tables" || true
  head -c 200 /tmp/pub2.txt; echo
fi

echo
echo '===== Hall AUTO-LOGOUT count + first seen today ====='
grep -c 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log
grep 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log | head -3
grep 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log | grep '2026-09-13 13:5' | head -5
grep -E 'ECONNREFUSED|timeout|Cannot|FATAL|crash|Unhandled|listen' /root/.pm2/logs/server-sexy-error-0.log | grep '2026-09-13' | tail -30

echo
echo '===== session2 around 13:50-14:10 FE sync / restart ====='
grep -E '2026-09-13T06:5|2026-09-13T07:0|2026-09-13 13:5|2026-09-13 14:0' /root/.pm2/logs/session-sexy-2-out.log | grep -iE 'restart|expire|logout|detach|FATAL|crash|error|sync|timeout|black' | tail -40
grep -E '2026-09-13T06:5|2026-09-13T07:0' /root/.pm2/logs/bot-sexy-2-out.log | grep -iE 'timeout|restart|FAIL|error|API' | tail -30

echo
echo '===== memory pressure ====='
ps aux --sort=-%mem | head -15
free -h
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
