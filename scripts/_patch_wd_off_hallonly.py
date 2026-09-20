from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# 1) Watchdog skip in HALL_ONLY — keepalive owns recover
old_wd = """  if (
    watchdogResetting ||
    !page ||
    resetInFlight ||
    shutdownInFlight
  ) {
    return;
  }
  const staleMs = Date.now() - lastSessionProgressAt;
  if (staleMs < 120000) return;"""

new_wd = """  if (
    watchdogResetting ||
    !page ||
    resetInFlight ||
    shutdownInFlight
  ) {
    return;
  }
  // HALL_ONLY: không để watchdog 2 phút đạp login — mất nhịp = mất DỰ ĐOÁN
  if (typeof isHallOnlyMode === "function" && isHallOnlyMode()) return;
  const staleMs = Date.now() - lastSessionProgressAt;
  if (staleMs < 120000) return;"""

if old_wd not in text:
    raise SystemExit("watchdog guard not found")
text = text.replace(old_wd, new_wd, 1)
print("OK: watchdog skip HALL_ONLY")

# 2) Don't treat generic 'session' as logout
old_lo = """      if (/auto logout|logged out|session/i.test(String(pollPreview || ""))) {
        if (lastHallIngestAt && Date.now() - lastHallIngestAt < 40000) {
          lastHallIngestAt = Date.now() - 50000;
        }
      }"""
new_lo = """      if (/Auto Logout Relay|logged out because/i.test(String(pollPreview || ""))) {
        console.log("[HALL POLL] logout html — mark stale for soft recover");
        if (lastHallIngestAt && Date.now() - lastHallIngestAt < 40000) {
          lastHallIngestAt = Date.now() - 50000;
        }
      }"""
if old_lo not in text:
    print("WARN: logout regex block not found")
else:
    text = text.replace(old_lo, new_lo, 1)
    print("OK: logout regex tightened")

# 3) Keepalive always bump progress if page alive
old_tick = """        // Network HALL FORWARD cũng tính là sống — đừng để watchdog 147s đè
        let staleBefore = Date.now() - (lastHallIngestAt || Date.now());
        if (staleBefore < 30000) lastSessionProgressAt = Date.now();"""
new_tick = """        // Page còn = tiến triển. Watchdog hall-only đã tắt; vẫn giữ stamp cho log.
        lastSessionProgressAt = Date.now();
        let staleBefore = Date.now() - (lastHallIngestAt || Date.now());"""
if old_tick not in text:
    print("WARN: keepalive tick stamp not found")
else:
    text = text.replace(old_tick, new_tick, 1)
    print("OK: keepalive always progress")

# 4) force_reenter / NS2_restart ignore in HALL_ONLY
old_rst = """socket.on(`${nameServiceSocket}_restart`, async (data) => {
  await helper.appendToLog(
    `(SOCKET) - RESTART ${nameServiceSocket} - (SERVER)`,
    logsNameProgress
  );
  console.log(`(SOCKET) - RESTART ${nameServiceSocket}`);
  resetMain();
});"""
new_rst = """socket.on(`${nameServiceSocket}_restart`, async (data) => {
  if (isHallOnlyMode()) {
    console.log(`[HALL ONLY] ignore ${nameServiceSocket}_restart`);
    return;
  }
  await helper.appendToLog(
    `(SOCKET) - RESTART ${nameServiceSocket} - (SERVER)`,
    logsNameProgress
  );
  console.log(`(SOCKET) - RESTART ${nameServiceSocket}`);
  resetMain();
});"""
if old_rst not in text:
    print("WARN: restart socket not found")
else:
    text = text.replace(old_rst, new_rst, 1)
    print("OK: ignore NS restart in hall-only")

old_re = """socket.on("force_reenter_table", async (data) => {
  const targetNs = data?.nameService ? String(data.nameService).trim().toUpperCase() : null;
  if (targetNs && targetNs !== nameServiceSocket) return;"""
new_re = """socket.on("force_reenter_table", async (data) => {
  const targetNs = data?.nameService ? String(data.nameService).trim().toUpperCase() : null;
  if (targetNs && targetNs !== nameServiceSocket) return;
  if (isHallOnlyMode()) {
    console.log("[HALL ONLY] ignore force_reenter_table");
    return;
  }"""
if old_re not in text:
    print("WARN: force_reenter not found")
else:
    text = text.replace(old_re, new_re, 1)
    print("OK: ignore force_reenter")

p.write_text(text, encoding="utf-8")
print("WROTE")
