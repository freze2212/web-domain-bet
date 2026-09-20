import { Client } from "ssh2";

const remote = `
set -e
BOT=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/bot.py
cp -a "$BOT" "$BOT.bak-skip-photo-$(date +%s)"

python3 - <<'PY'
from pathlib import Path
p = Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/bot.py')
text = p.read_text(encoding='utf-8')
old = '''            if globals().get('_skip_ho_until_photo'):
                need_stamp = int(globals().get('_need_photo_after_stamp') or 0)
                if not screenshot_allows_ho(
                    target_table, min_stamp=need_stamp, max_age_s=90
                ):
                    print(
                        f"[HÔ BLOCK] {target_table} ván trước chưa có ảnh — không gửi text",
                        flush=True,
                    )
                    last_ho_key = f"{target_table}|{before_stamp}"
                    await asyncio.sleep(1)
                    continue'''

new = '''            # HALL_ONLY / SKIP_HO_PHOTO: không cần ảnh capture vẫn ghi dự đoán + hô text
            import os as _os_ho
            _skip_photo_gate = str(_os_ho.environ.get('SKIP_HO_PHOTO') or _os_ho.environ.get('HALL_ONLY') or '').strip().lower() in ('1', 'true', 'yes')
            if globals().get('_skip_ho_until_photo') and not _skip_photo_gate:
                need_stamp = int(globals().get('_need_photo_after_stamp') or 0)
                if not screenshot_allows_ho(
                    target_table, min_stamp=need_stamp, max_age_s=90
                ):
                    print(
                        f"[HÔ BLOCK] {target_table} ván trước chưa có ảnh — không gửi text",
                        flush=True,
                    )
                    last_ho_key = f"{target_table}|{before_stamp}"
                    await asyncio.sleep(1)
                    continue
            elif globals().get('_skip_ho_until_photo') and _skip_photo_gate:
                print(
                    f"[HALL ONLY] {target_table} bỏ gate ảnh — vẫn hô/dự đoán text",
                    flush=True,
                )
                globals()['_skip_ho_until_photo'] = False
                globals()['_need_photo_after_stamp'] = 0'''

if old not in text:
    raise SystemExit('photo gate block not found')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('OK bot photo gate')
PY

# persist env on bot runner
grep -q SKIP_HO_PHOTO /tmp/run-bot-ns2.sh || sed -i '/HO_VIA_BOT=1/a export SKIP_HO_PHOTO=1\\nexport HALL_ONLY=1' /tmp/run-bot-ns2.sh
# also durable copy
cat > /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh <<'SH'
#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export NAME_SERVICE=NS2
export HO_VIA_BOT=1
export SKIP_HO_PHOTO=1
export HALL_ONLY=1
export PYTHONUNBUFFERED=1
export GROUP=-1004296530499
export GROUP_NS2=-1004296530499
exec ./venv/bin/python bot.py
SH
chmod +x /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh
cp -a /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh /tmp/run-bot-ns2.sh

# rebind pm2 bot to durable script
pm2 delete bot_sexy_2 || true
pm2 start /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh --name bot_sexy_2 --interpreter bash
pm2 save

echo '--- wait session lobby ---'
sleep 90
export TZ=Asia/Ho_Chi_Minh
date
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo '=== session key ==='
grep -E 'HALL ONLY|NOTIFY|FORWARD|POLL|AUTO ENTER|CLICK TABLE|Error in main|iframeGameHall' /root/.pm2/logs/session-sexy-2-out.log | tail -40
echo '=== bot key ==='
tail -n 25 /root/.pm2/logs/bot-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
