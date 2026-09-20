from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")
old = """  console.log("[HALL KEEPALIVE] started for " + nameServiceSocket);
  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;"""
new = """  console.log("[HALL KEEPALIVE] started for " + nameServiceSocket);
  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) {
      const lockAge = Date.now() - Number(globalThis.__hallKeepLockAt || 0);
      if (lockAge < 45000) return;
      console.log("[HALL KEEPALIVE] lock stuck " + Math.round(lockAge / 1000) + "s — unlock");
      hallKeepaliveRunning = false;
    }
    hallKeepaliveRunning = true;
    globalThis.__hallKeepLockAt = Date.now();"""
if old not in text:
    raise SystemExit("keepalive lock start not found")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")
print("OK: keepalive stuck-lock unlock 45s")
