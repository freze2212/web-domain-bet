from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

start = text.find("/** Poll Hall API.")
if start < 0:
    raise SystemExit("poll start missing")
hb = text.find("\nfunction startActiveTableHeartbeat()", start)
if hb < 0:
    raise SystemExit("heartbeat missing")

new_poll = r'''/** Poll Hall API.
 *  HALL_ONLY: fetch bên trong gameHallFrame (đúng origin/cookie game).
 *  Không dùng Node axios/page.request — hay ra Auto Logout / body rỗng.
 *  Frame detach → rebind sảnh, KHÔNG resetMain.
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
      // Rebind sảnh nếu frame cũ chết
      if (!gameHallFrame || (typeof gameHallFrame.isClosed === "function" && gameHallFrame.isClosed())) {
        const refreshed = await resolveGameHallFrame().catch(() => null);
        if (refreshed) gameHallFrame = refreshed;
      }
      const frames = [gameHallFrame, seamlessFrame].filter(Boolean);
      for (const frame of frames) {
        if (!frame || (typeof frame.isClosed === "function" && frame.isClosed())) continue;
        let hit = null;
        try {
          hit = await withTimeout(
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
                return { ok: true, json: JSON.parse(text), status: r.status };
              } catch (_) {
                return { ok: false, status: r.status, preview: text.slice(0, 100) };
              }
            }, url),
            8000,
            null
          );
        } catch (evErr) {
          pollPreview = "evaluate=" + (evErr.message || evErr);
          const refreshed = await resolveGameHallFrame().catch(() => null);
          if (refreshed) gameHallFrame = refreshed;
          continue;
        }
        if (!hit) continue;
        if (hit.ok && hit.json && typeof hit.json === "object") {
          hallData = hit.json;
          break;
        }
        pollPreview =
          "status=" +
          hit.status +
          " preview=" +
          String(hit.preview || "").replace(/\s+/g, " ").slice(0, 100);
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
              return { ok: true, json: JSON.parse(text), status: r.status };
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
    if (hallOnly) {
      const refreshed = await resolveGameHallFrame().catch(() => null);
      if (refreshed) gameHallFrame = refreshed;
    }
  }
}
'''

text = text[:start] + new_poll + text[hb:]
p.write_text(text, encoding="utf-8")
print("OK lobby frame.evaluate poll")
