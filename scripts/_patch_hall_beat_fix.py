from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# 1) On HALL_ONLY boot: seed lastHallIngestAt so staleMs isn't epoch-huge / and mark progress
old = """      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);
      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;
      startHallOnlyKeepalive();
"""

new = """      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);
      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;
      lastHallIngestAt = Date.now(); // seed — tránh staleMs = epoch → hard reset/logic lệch
      lastSessionProgressAt = Date.now();
      startHallOnlyKeepalive();
      // kick poll ngay 1 lần (không chờ interval)
      pollHallFromBrowserAndIngest().catch(() => {});
"""

if old not in text:
    raise SystemExit("boot seed block not found")
text = text.replace(old, new, 1)
print("OK seed on boot")

# 2) Keepalive: never block forever — wrap poll with overall timeout, always clear running flag
old_tick = """  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;
    (async () => {
      try {
        // Network HALL FORWARD cũng tính là sống — đừng để watchdog 147s đè
        const staleBefore = Date.now() - (lastHallIngestAt || 0);
        if (staleBefore < 30000) lastSessionProgressAt = Date.now();

        const ok = await pollHallFromBrowserAndIngest();
        const staleMs = Date.now() - (lastHallIngestAt || 0);
"""

new_tick = """  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;
    (async () => {
      try {
        // Network HALL FORWARD cũng tính là sống — đừng để watchdog 147s đè
        let staleBefore = Date.now() - (lastHallIngestAt || Date.now());
        if (staleBefore < 30000) lastSessionProgressAt = Date.now();

        let ok = false;
        try {
          ok = await Promise.race([
            pollHallFromBrowserAndIngest(),
            new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
          ]);
        } catch (_) {
          ok = false;
        }
        const staleMs = Date.now() - (lastHallIngestAt || Date.now());
"""

if old_tick not in text:
    raise SystemExit("keepalive tick not found")
text = text.replace(old_tick, new_tick, 1)
print("OK keepalive poll race timeout")

# 3) Soft recover sooner if never got ingest since boot — after 20s no forward
# Change first threshold 15s rebind stays; ensure soft recover at 45s uses lastHallIngestAt seeded

# 4) Log when poll returns false for visibility every 20s already exists

# 5) In pollHall — if Auto Logout HTML, force soft recover path by NOT updating lastHallIngestAt (already) but set a flag / return false and bump a counter. Also detect logout in preview and call recover sooner via setting lastHallIngestAt old.

old_preview_fail = """    if (!hallData || typeof hallData !== "object") {
      if (Date.now() - lastHallShapeLogAt > 20000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " no-json " + pollPreview);
      }
      return false;
    }"""

new_preview_fail = """    if (!hallData || typeof hallData !== "object") {
      if (Date.now() - lastHallShapeLogAt > 15000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " no-json " + pollPreview);
      }
      // Auto Logout / HTML → coi hall chết, kéo stale để soft recover sớm
      if (/auto logout|logged out|session/i.test(String(pollPreview || ""))) {
        if (lastHallIngestAt && Date.now() - lastHallIngestAt < 40000) {
          lastHallIngestAt = Date.now() - 50000;
        }
      }
      return false;
    }"""

if old_preview_fail not in text:
    raise SystemExit("preview fail block not found")
text = text.replace(old_preview_fail, new_preview_fail, 1)
print("OK logout → stale for soft recover")

p.write_text(text, encoding="utf-8")
print("WROTE")
