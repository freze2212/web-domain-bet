from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# Backup already done by deploy wrapper

# 1) Replace HALL_ONLY boot block: notify track table instead of clear
old_hall = '''    // HALL_ONLY: ở lại sảnh forward hall API — không vào bàn / không capture
    if (isHallOnlyMode()) {
      currentInTable = null;
      await clearActiveTableOnServer().catch(() => {});
      await helper.appendToLog(
        "🏛️ [HALL ONLY] Ở lại sảnh — không vào bàn (chỉ forward hall API)",
        logsNameProgress
      );
      console.log(
        "[HALL ONLY] " + nameServiceSocket + " stay lobby — skip enter table"
      );
      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);
      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;
      startActiveTableHeartbeat();
    } else {'''

new_hall = '''    // HALL_ONLY: ở lại sảnh (ổn định hall) + notify bàn theo dõi để bot vẫn dự đoán
    if (isHallOnlyMode()) {
      const trackDefaults = { 1: "C01", 2: "C03", 3: "C05", 4: "C08", 5: "C10" };
      const trackTable = String(
        process.env.HALL_TRACK_TABLE ||
          requestedTargetTable ||
          trackDefaults[accountIdx] ||
          "C03"
      )
        .trim()
        .toUpperCase();
      currentInTable = trackTable; // logical track — không click vào bàn
      await helper.appendToLog(
        "🏛️ [HALL ONLY] Ở lại sảnh — track " +
          trackTable +
          " (không enter, vẫn notify để dự đoán)",
        logsNameProgress
      );
      console.log(
        "[HALL ONLY] " +
          nameServiceSocket +
          " stay lobby — track=" +
          trackTable +
          " (no enter)"
      );
      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);
      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;
      await notifyActiveTableToServer(trackTable).catch(() => {});
      startActiveTableHeartbeat();
    } else {'''

if old_hall not in text:
    raise SystemExit("HALL_ONLY boot block not found")
text = text.replace(old_hall, new_hall, 1)
print("OK: HALL_ONLY notify track table")

# 2) Replace pollHall to use Node axios+cookies (no frame.evaluate) in HALL_ONLY
start = text.find("/** Poll Hall API tu browser cookie.")
if start < 0:
    raise SystemExit("poll comment not found")
hb = text.find("\nfunction startActiveTableHeartbeat()", start)
if hb < 0:
    raise SystemExit("heartbeat not found")

new_poll = r'''/** Poll Hall API.
 *  HALL_ONLY: axios + cookie từ browser (không frame.evaluate → tránh Frame detached).
 *  Mode cũ: poll qua frame khi đã vào bàn.
 */
async function pollHallFromBrowserAndIngest() {
  if (!page || page.isClosed()) return;
  const hallOnly = isHallOnlyMode();
  if (!hallOnly && !currentInTable) return;
  if (Date.now() - lastHallIngestAt < 900) return;
  const base =
    lastSessionRequestBase ||
    process.env.URI_REQUEST_DATA ||
    "";
  if (!base) return;
  const logTag = hallOnly ? "HALL POLL LOBBY" : "HALL POLL IN-TABLE";
  const where = hallOnly ? "LOBBY" : currentInTable;
  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return;
    const hallBase = lastSessionRequestBase || base;
    const url = hallBase + jsess;

    let hallData = null;
    let pollPreview = "";

    if (hallOnly) {
      // Node-side fetch — không đụng iframe (tránh detach làm chết luồng)
      const cookieHeader = cookies.map((c) => c.name + "=" + c.value).join("; ");
      try {
        const resp = await axios.post(url, "gameGroupId=2", {
          timeout: 8000,
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            accept: "application/json, text/plain, */*",
            cookie: cookieHeader,
          },
          validateStatus: () => true,
        });
        if (resp.status >= 200 && resp.status < 300 && resp.data && typeof resp.data === "object") {
          hallData = resp.data;
        } else {
          pollPreview =
            "status=" +
            resp.status +
            " preview=" +
            String(typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data || "")).slice(0, 80);
        }
      } catch (axErr) {
        pollPreview = "axios=" + (axErr.message || axErr);
      }
    } else {
      const frames = [gameCurrentFrame, seamlessFrame, gameHallFrame].filter(Boolean);
      for (const frame of frames) {
        if (!frame || (typeof frame.isClosed === "function" && frame.isClosed())) continue;
        const hit = await withTimeout(
          frame.evaluate(async (hallUrl) => {
            const body = new URLSearchParams({ gameGroupId: "2" });
            const r = await fetch(hallUrl, {
              method: "POST",
              headers: {
                "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                accept: "application/json, text/plain, */*",
              },
              body,
              credentials: "include",
            });
            const text = await r.text();
            try {
              const json = JSON.parse(text);
              return { ok: true, json, status: r.status };
            } catch (_) {
              return { ok: false, status: r.status, preview: text.slice(0, 80) };
            }
          }, url),
          8000,
          null
        );
        if (!hit) continue;
        if (hit.ok && hit.json && typeof hit.json === "object") {
          hallData = hit.json;
          break;
        }
        pollPreview =
          "status=" +
          hit.status +
          " preview=" +
          String(hit.preview || "").replace(/\s+/g, " ");
      }
    }

    if (!hallData || typeof hallData !== "object") {
      if (Date.now() - lastHallShapeLogAt > 15000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " no-json " + pollPreview);
      }
      return;
    }
    const tableItems =
      hallData?.tableItems ||
      hallData?.data?.tableItems ||
      hallData?.result?.tableItems;
    if (!Array.isArray(tableItems) || !tableItems.length) {
      if (Date.now() - lastHallShapeLogAt > 15000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " empty tables");
      }
      return;
    }
    await ingestHallTableItems(tableItems);
  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log("[" + logTag + "] " + where + " err=" + e.message);
    }
  }
}
'''

text = text[:start] + new_poll + text[hb:]
print("OK: pollHall axios for HALL_ONLY")

p.write_text(text, encoding="utf-8")
print("WROTE", p)
