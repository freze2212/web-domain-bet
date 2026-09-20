import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
START=$(date +%s)
START_TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "===== MONITOR START $START_TS ====="
echo

# baselines
DET0=$(grep -c 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log || true)
ALO0=$(grep -c 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log || true)
FWD0=$(grep -c '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-2-out.log || true)
BET0=$(grep -c 'SOCKET PLACE BET\\|API PLACE BET' /root/.pm2/logs/session-sexy-2-out.log || true)
SYNC0=$(grep -c 'FE SYNC WARN' /root/.pm2/logs/bot-sexy-2-out.log || true)
HO0=$(grep -c 'MAIN HO NOTIFY\\|BOT HÔ\\|\\[HÔ' /root/.pm2/logs/bot-sexy-2-out.log || true)
ING0=$(grep -c 'ingest-hall\\|INGEST\\|Hall ingest' /root/.pm2/logs/server-sexy-out-0.log || true)

echo "baseline detach=$DET0 autologout=$ALO0 forward=$FWD0 bet=$BET0 fesync=$SYNC0 ho=$HO0"
echo

for i in 1 2 3 4 5 6 7 8 9 10; do
  NOW=$(date '+%H:%M:%S')
  AT=$(curl -sS -m 4 https://tool.toolbcr79.com/api/get-active-table 2>/dev/null || echo '{"err":1}')
  OC=$(curl -sS -m 4 https://tool.toolbcr79.com/api/occupied-tables 2>/dev/null || echo '{"err":1}')
  # poll-main-ho without params may return latest-ish
  HO=$(curl -sS -m 4 'https://tool.toolbcr79.com/api/poll-main-ho-for-round' 2>/dev/null || echo '{"err":1}')
  DET=$(grep -c 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log || true)
  ALO=$(grep -c 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log || true)
  FWD=$(grep -c '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-2-out.log || true)
  LAST=$(tail -n 8 /root/.pm2/logs/session-sexy-2-out.log | tr '\\n' ' | ' | tail -c 350)
  STAT=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; a=json.load(sys.stdin);
for p in a:
  if p.get('name')=='session_sexy_2':
    e=p.get('pm2_env') or {};
    print(e.get('status'), 'up='+str(int((( __import__('time').time()*1000)-(e.get('pm_uptime') or 0))/1000))+'s', 'rst='+str(e.get('restart_time')), 'mem='+str((p.get('monit') or {}).get('memory')))" 2>/dev/null)
  echo "[$i/10 $NOW] sess=$STAT dDET=$((DET-DET0)) dALO=$((ALO-ALO0)) dFWD=$((FWD-FWD0))"
  echo "  active=$AT"
  echo "  occupied=$OC"
  echo "  pollHo=$(echo "$HO" | head -c 220)"
  echo "  lastLog=$LAST"
  echo
  sleep 30
done

END_TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "===== MONITOR END $END_TS ====="
DET=$(grep -c 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log || true)
ALO=$(grep -c 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log || true)
FWD=$(grep -c '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-2-out.log || true)
BET=$(grep -c 'SOCKET PLACE BET\\|API PLACE BET' /root/.pm2/logs/session-sexy-2-out.log || true)
SYNC=$(grep -c 'FE SYNC WARN' /root/.pm2/logs/bot-sexy-2-out.log || true)
HOC=$(grep -c 'MAIN HO NOTIFY\\|BOT HÔ\\|\\[HÔ' /root/.pm2/logs/bot-sexy-2-out.log || true)

echo
echo '===== 5m DELTAS ====='
echo "Frame detached: $((DET-DET0))"
echo "AUTO-LOGOUT: $((ALO-ALO0))"
echo "HALL FORWARD: $((FWD-FWD0))"
echo "PLACE BET lines: $((BET-BET0))"
echo "FE SYNC WARN: $((SYNC-SYNC0))"
echo "HO/NOTIFY lines: $((HOC-HO0))"
echo
echo '===== last 25 session out ====='
tail -n 25 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '===== last 15 bot out ====='
tail -n 15 /root/.pm2/logs/bot-sexy-2-out.log
echo
echo '===== last 10 server err ====='
tail -n 10 /root/.pm2/logs/server-sexy-error-0.log
echo
echo '===== PM2 / RAM ====='
pm2 list
free -h
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
