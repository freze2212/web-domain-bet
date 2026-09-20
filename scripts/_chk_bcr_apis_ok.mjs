import { Client } from "ssh2";

const cmd = `
echo '===== real GET APIs ====='
for u in \
  'http://127.0.0.1:3201/api/occupied-tables' \
  'http://127.0.0.1:3201/api/get-active-table' \
  'http://127.0.0.1:3201/api/latest-screenshot' \
  'http://127.0.0.1:3201/api/main-ho-status' \
  'http://127.0.0.1:3201/api/poll-main-ho-for-round'
 do
  code=$(curl -sS -m 5 -o /tmp/b.txt -w '%{http_code}' "$u" || echo ERR)
  echo "$code $u"
  head -c 300 /tmp/b.txt; echo; echo
done

echo '===== public same ====='
for u in occupied-tables get-active-table main-ho-status latest-screenshot; do
  code=$(curl -sS -m 8 -o /tmp/b.txt -w '%{http_code}' "https://tool.toolbcr79.com/api/$u" || echo ERR)
  echo "$code https://tool.toolbcr79.com/api/$u | $(head -c 180 /tmp/b.txt | tr '\\n' ' ')"
done

echo
echo '===== when did Frame detached start ====='
grep -n 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log | head -5
grep -n 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log | tail -5
echo count_detached=$(grep -c 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log)

echo
echo '===== ingest hall success? last ====='
grep -E 'ingest|AUTO-LOGOUT|hall' /root/.pm2/logs/server-sexy-out-0.log | tail -20
grep -E '2026-09-13 13:5[5-9]|2026-09-13 14:0' /root/.pm2/logs/server-sexy-out-0.log | grep -iE 'ingest|hall|logout|error' | tail -20
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
