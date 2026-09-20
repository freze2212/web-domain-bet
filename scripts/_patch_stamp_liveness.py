from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# init lastHallFreshAt next to lastHallIngestAt
if "let lastHallFreshAt" not in text:
    old = "let lastHallIngestAt"
    # might be without let on same line - find assignment
    if "lastHallIngestAt = 0" in text:
        text = text.replace(
            "lastHallIngestAt = 0",
            "lastHallIngestAt = 0;\nlet lastHallFreshAt = 0",
            1,
        )
        print("OK: init lastHallFreshAt after =0")
    elif "let lastHallIngestAt =" in text:
        text = text.replace(
            "let lastHallIngestAt =",
            "let lastHallFreshAt = 0;\nlet lastHallIngestAt =",
            1,
        )
        print("OK: init lastHallFreshAt")
    else:
        # insert near first lastHallIngestAt declaration
        i = text.find("lastHallIngestAt")
        if i < 0:
            raise SystemExit("lastHallIngestAt missing")
        text = text[:i] + "let lastHallFreshAt = 0;\n" + text[i:]
        print("OK: prepend lastHallFreshAt")
else:
    print("SKIP: lastHallFreshAt exists")

old_ing = """async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now(); // hall forward = tiến triển (tránh WATCHDOG reset oan)
  const serverPort = process.env.SERVER_PORT || 3201;"""

new_ing = """function maxRoadStamp(tableItems) {
  let max = 0;
  if (!Array.isArray(tableItems)) return 0;
  for (const it of tableItems) {
    const roads =
      (it && it.roadInfo && it.roadInfo.bigRoads) ||
      (it && it.bigRoads) ||
      [];
    if (!Array.isArray(roads)) continue;
    for (const r of roads) {
      const s = Number(r && r.stampTime);
      if (s > max) max = s;
    }
    const ts = Number(it && it.tableInfo && it.tableInfo.stampTime);
    if (ts > max) max = ts;
  }
  return max;
}

async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  const fresh = maxRoadStamp(tableItems);
  if (fresh && fresh !== Number(globalThis.__lastRoadStamp || 0)) {
    globalThis.__lastRoadStamp = fresh;
    lastHallFreshAt = Date.now();
  } else if (!lastHallFreshAt) {
    lastHallFreshAt = Date.now();
  }
  lastSessionProgressAt = Date.now();
  const serverPort = process.env.SERVER_PORT || 3201;"""

if old_ing not in text:
    raise SystemExit("ingest block not found")
text = text.replace(old_ing, new_ing, 1)
print("OK: stamp freshness on ingest")

# keepalive: use lastHallFreshAt, fix falsy Date.now() trap
old_k = """        lastSessionProgressAt = Date.now();
        let staleBefore = Date.now() - (lastHallIngestAt || Date.now());

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

        if (ok || staleMs < 30000) {
          lastSessionProgressAt = Date.now();
          return;
        }"""

new_k = """        lastSessionProgressAt = Date.now();
        const liveAt = lastHallFreshAt || lastHallIngestAt || 0;
        const staleMs = liveAt ? Date.now() - liveAt : 999999;

        let ok = false;
        try {
          ok = await Promise.race([
            pollHallFromBrowserAndIngest(),
            new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
          ]);
        } catch (_) {
          ok = false;
        }
        const liveAt2 = lastHallFreshAt || lastHallIngestAt || 0;
        const staleAfter = liveAt2 ? Date.now() - liveAt2 : 999999;

        // ok = poll JSON được. Chưa đủ: phải có ván mới trong 90s.
        if (staleAfter < 90000) {
          lastSessionProgressAt = Date.now();
          return;
        }
        console.log(
          "[HALL KEEPALIVE] stale rounds " +
            Math.round(staleAfter / 1000) +
            "s (pollOk=" +
            ok +
            ")"
        );"""

if old_k not in text:
    raise SystemExit("keepalive tick not found")
text = text.replace(old_k, new_k, 1)
print("OK: keepalive uses stamp freshness 90s")

# remaining staleMs in keepalive still refers old var — replace leftover staleMs in that function
# The next blocks use staleMs >= 15000 and staleMs >= 45000. After our replace, those still say staleMs.
# Need to use staleAfter.

text2 = text.replace(
    """        if (staleMs >= 15000 && staleMs < 45000) {""",
    """        if (staleAfter >= 15000 && staleAfter < 45000) {""",
    1,
)
if text2 == text:
    print("WARN: 15-45 block not updated")
else:
    text = text2
    print("OK: 15-45 uses staleAfter")

text2 = text.replace(
    """            console.log(
              "[HALL KEEPALIVE] rebind stale=" + Math.round(staleMs / 1000) + "s"
            );""",
    """            console.log(
              "[HALL KEEPALIVE] rebind stale=" + Math.round(staleAfter / 1000) + "s"
            );""",
    1,
)
text = text2

text2 = text.replace("        if (staleMs >= 45000) {", "        if (staleAfter >= 45000) {", 1)
if text2 == text:
    print("WARN: 45s block")
else:
    text = text2
    print("OK: 45s uses staleAfter")

for old, new in [
    (
        'Math.round(staleMs / 1000) +\n                "s"',
        'Math.round(staleAfter / 1000) +\n                "s"',
    ),
    (
        'Math.round(staleMs / 1000) +\n              "s (soft fail)"',
        'Math.round(staleAfter / 1000) +\n              "s (soft fail)"',
    ),
]:
    if old in text:
        text = text.replace(old, new, 1)
        print("OK replace staleMs log")

# resetMain: allow when stamps stale > 90s (keepalive already set allow)
old_rm = """    if (!allow && lastHallIngestAt && ingestedAgo < 180000) {
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
    }"""

new_rm = """    const freshAgo = lastHallFreshAt ? Date.now() - lastHallFreshAt : 1e15;
    // Chặn reset spam khi ván vẫn nhảy. Nếu ván đứng >90s thì KHÔNG chặn keepalive.
    if (!allow && freshAgo < 90000) {
      console.log(
        "[HALL ONLY] block resetMain — round còn mới " +
          Math.round(freshAgo / 1000) +
          "s trước"
      );
      return null;
    }
    if (!allow && freshAgo < 600000) {
      console.log(
        "[HALL ONLY] block resetMain — chờ keepalive, round " +
          Math.round(freshAgo / 1000) +
          "s"
      );
      return null;
    }"""

if old_rm not in text:
    raise SystemExit("resetMain block not found")
text = text.replace(old_rm, new_rm, 1)
print("OK: reset choke uses round freshness")

p.write_text(text, encoding="utf-8")
print("WROTE")
