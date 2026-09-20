from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

old = """async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  const serverPort = process.env.SERVER_PORT || 3201;"""

new = """async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now(); // hall forward = tiến triển (tránh WATCHDOG reset oan)
  const serverPort = process.env.SERVER_PORT || 3201;"""

if old not in text:
    raise SystemExit("ingestHallTableItems block not found")
text = text.replace(old, new, 1)

# Also bump progress at start of each keepalive tick when recent ingest
old_k = """  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;
    (async () => {
      try {
        const ok = await pollHallFromBrowserAndIngest();
        const staleMs = Date.now() - (lastHallIngestAt || 0);

        if (ok || staleMs < 15000) {
          lastSessionProgressAt = Date.now();
          return;
        }"""

new_k = """  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;
    (async () => {
      try {
        // Network HALL FORWARD cũng tính là sống — đừng để watchdog 147s đè
        const staleBefore = Date.now() - (lastHallIngestAt || 0);
        if (staleBefore < 30000) lastSessionProgressAt = Date.now();

        const ok = await pollHallFromBrowserAndIngest();
        const staleMs = Date.now() - (lastHallIngestAt || 0);

        if (ok || staleMs < 30000) {
          lastSessionProgressAt = Date.now();
          return;
        }"""

if old_k not in text:
    raise SystemExit("keepalive tick block not found")
text = text.replace(old_k, new_k, 1)

# Raise hard-reset threshold 120s -> 300s for hall-only (prefer soft recover)
text2 = text.replace(
    "if (staleMs >= 45000 && staleMs < 120000)",
    "if (staleMs >= 45000 && staleMs < 300000)",
    1,
)
if text2 == text:
    print("WARN: soft recover range not updated")
else:
    text = text2
    print("OK: soft recover up to 300s")

text = text.replace(
    """        console.log(
          "[HALL KEEPALIVE] hard resetMain — hall stale " +
            Math.round(staleMs / 1000) +
            "s"
        );
        lastSessionProgressAt = Date.now();
        await resetMain().catch((e) =>
          console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
        );""",
    """        if (staleMs >= 300000) {
          console.log(
            "[HALL KEEPALIVE] hard resetMain — hall stale " +
              Math.round(staleMs / 1000) +
              "s"
          );
          lastSessionProgressAt = Date.now();
          await resetMain().catch((e) =>
            console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
          );
        }""",
    1,
)

p.write_text(text, encoding="utf-8")
print("OK progress on ingest + keepalive")
