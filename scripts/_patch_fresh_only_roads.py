from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

old_max = """function maxRoadStamp(tableItems) {
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
}"""

new_max = """function maxRoadStamp(tableItems) {
  let max = 0;
  if (!Array.isArray(tableItems)) return 0;
  for (const it of tableItems) {
    const roads =
      (it && it.roadInfo && it.roadInfo.bigRoads) ||
      (it && it.roadInfo && it.roadInfo.roads) ||
      (it && it.bigRoads) ||
      (it && it.roads) ||
      [];
    if (!Array.isArray(roads)) continue;
    for (const r of roads) {
      const s = Number(r && (r.stampTime || r.stamp || r.time));
      if (s > max) max = s;
    }
  }
  return max;
}"""

if old_max not in text:
    raise SystemExit("maxRoadStamp not found")
text = text.replace(old_max, new_max, 1)

old_ing = """  const fresh = maxRoadStamp(tableItems);
  if (fresh && fresh !== Number(globalThis.__lastRoadStamp || 0)) {
    globalThis.__lastRoadStamp = fresh;
    lastHallFreshAt = Date.now();
  } else if (!lastHallFreshAt) {
    lastHallFreshAt = Date.now();
  }"""

new_ing = """  const fresh = maxRoadStamp(tableItems);
  if (fresh && fresh !== Number(globalThis.__lastRoadStamp || 0)) {
    globalThis.__lastRoadStamp = fresh;
    lastHallFreshAt = Date.now();
    console.log("[HALL FRESH] roadStamp=" + fresh);
  }"""

if old_ing not in text:
    raise SystemExit("ingest fresh block not found")
text = text.replace(old_ing, new_ing, 1)

text = text.replace(
    "const liveAt = lastHallFreshAt || lastHallIngestAt || 0;",
    "const liveAt = lastHallFreshAt || 0;",
    1,
)
text = text.replace(
    "const liveAt2 = lastHallFreshAt || lastHallIngestAt || 0;",
    "const liveAt2 = lastHallFreshAt || 0;",
    1,
)
print("OK: freshness = bigRoads only, no ingest fallback")
p.write_text(text, encoding="utf-8")
