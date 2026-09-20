from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# 1) recoverFromFatalUi — HALL_ONLY không được đạp browser
old_fatal = """async function recoverFromFatalUi(reason) {
  if (sessionRecovering || resetInFlight || enterInFlight) {
    console.log(`[RECOVER] đang recover/enter (${reason}) — bỏ lệnh trùng`);
    return resetInFlight;
  }"""

new_fatal = """async function recoverFromFatalUi(reason) {
  if (isHallOnlyMode()) {
    console.log("[HALL ONLY] ignore FATAL UI reset: " + reason);
    return null;
  }
  if (sessionRecovering || resetInFlight || enterInFlight) {
    console.log(`[RECOVER] đang recover/enter (${reason}) — bỏ lệnh trùng`);
    return resetInFlight;
  }"""

if old_fatal not in text:
    raise SystemExit("recoverFromFatalUi not found")
text = text.replace(old_fatal, new_fatal, 1)
print("OK: fatal UI blocked")

# 2) resetMain choke — chỉ keepalive / boot fail (chưa từng ingest) được reset
old_rm = """async function resetMain() {
  if (resetInFlight) {
    console.log("[RESET] Đang reset — bỏ lệnh trùng (chống nhân bản Chromium)");
    return resetInFlight;
  }"""

new_rm = """async function resetMain() {
  if (isHallOnlyMode()) {
    const allow = !!globalThis.__allowHallOnlyReset;
    const ingestedAgo = lastHallIngestAt ? Date.now() - lastHallIngestAt : 1e15;
    // Boot fail: chưa ingest lần nào → cho login lại.
    // Keepalive: set __allowHallOnlyReset sau soft fail + cooldown.
    // Còn lại (watchdog/fatal/socket/click fatal): CHẶN — đây là thứ giết 24/24.
    if (!allow && lastHallIngestAt && ingestedAgo < 180000) {
      console.log(
        "[HALL ONLY] block resetMain — hall ingest " +
          Math.round(ingestedAgo / 1000) +
          "s trước"
      );
      return null;
    }
    if (!allow && lastHallIngestAt && ingestedAgo < 600000 && !globalThis.__allowHallOnlyReset) {
      console.log(
        "[HALL ONLY] block resetMain — chưa tới quyền keepalive, ingest " +
          Math.round(ingestedAgo / 1000) +
          "s trước"
      );
      return null;
    }
    globalThis.__allowHallOnlyReset = false;
  }
  if (resetInFlight) {
    console.log("[RESET] Đang reset — bỏ lệnh trùng (chống nhân bản Chromium)");
    return resetInFlight;
  }"""

if old_rm not in text:
    raise SystemExit("resetMain not found")
text = text.replace(old_rm, new_rm, 1)
print("OK: resetMain choke")

# 3) keepalive hard reset must set allow flag
old_hard = """          globalThis.__hallHardResetAt = Date.now();
          console.log(
            "[HALL KEEPALIVE] hard resetMain — hall stale " +
              Math.round(staleMs / 1000) +
              "s (soft fail)"
          );
          lastSessionProgressAt = Date.now();
          await resetMain().catch((e) =>
            console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
          );"""

new_hard = """          globalThis.__hallHardResetAt = Date.now();
          globalThis.__allowHallOnlyReset = true;
          console.log(
            "[HALL KEEPALIVE] hard resetMain — hall stale " +
              Math.round(staleMs / 1000) +
              "s (soft fail)"
          );
          lastSessionProgressAt = Date.now();
          await resetMain().catch((e) =>
            console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
          );"""

if old_hard not in text:
    raise SystemExit("keepalive hard reset not found")
text = text.replace(old_hard, new_hard, 1)
print("OK: keepalive allow flag")

# 4) clickButton isFatal — hall-only đừng reset vì miss 1 click
old_click = """  if (isFatal) {
    await resetMain();
  }"""
new_click = """  if (isFatal && !isHallOnlyMode()) {
    await resetMain();
  }"""
if old_click not in text:
    print("WARN: isFatal reset not found")
else:
    text = text.replace(old_click, new_click, 1)
    print("OK: isFatal click no reset")

p.write_text(text, encoding="utf-8")
print("WROTE")
