from pathlib import Path
import re

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# restore from bak if partial
baks = sorted(Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer").glob("session.js.bak-hall-only-*"))
if baks:
    # use newest bak only if current already has partial helper without full gate
    newest = baks[-1]
    cur = text
    if "function isHallOnlyMode" in cur and "stay lobby — skip enter table" not in cur:
        text = newest.read_text(encoding="utf-8")
        print("RESTORED_FROM", newest)

needle = "const nameServiceSocket = account.nameServiceSocket;"
if "function isHallOnlyMode" not in text:
    insert = needle + '''

/** Chi can hall/list ban — khong vao ban, khong capture/ho. */
function isHallOnlyMode() {
  const v = String(process.env.HALL_ONLY || process.env.SKIP_ENTER_TABLE || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
'''
    if needle not in text:
        raise SystemExit("nameServiceSocket needle missing")
    text = text.replace(needle, insert, 1)
    print("OK: inserted isHallOnlyMode")
else:
    print("SKIP: isHallOnlyMode already present")

new_poll = '''/** Poll Hall API tu browser cookie.
 *  HALL_ONLY: poll tu sanh (gameHallFrame) — khong can vao ban.
 *  Mode cu: poll khi da vao ban (in-table frames).
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
  const logTag = hallOnly || !currentInTable ? "HALL POLL LOBBY" : "HALL POLL IN-TABLE";
  const where = hallOnly ? "LOBBY" : currentInTable;
  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return;
    const hallBase = lastSessionRequestBase || base;
    const url = hallBase + jsess;
    const frames = hallOnly
      ? [gameHallFrame, seamlessFrame, page].filter(Boolean)
      : [gameCurrentFrame, seamlessFrame, gameHallFrame].filter(Boolean);
    let hallData = null;
    let pollPreview = "";
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
        String(hit.preview || "").replace(/\\s+/g, " ");
    }
    if (!hallData || typeof hallData !== "object") {
      if (Date.now() - lastHallShapeLogAt > 15000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " no-json " + pollPreview);
        if (hallOnly) {
          const refreshed = await resolveGameHallFrame().catch(() => null);
          if (refreshed) gameHallFrame = refreshed;
        }
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
    if (hallOnly && /detach|Execution context|Target closed/i.test(String(e.message || ""))) {
      const refreshed = await resolveGameHallFrame().catch(() => null);
      if (refreshed) gameHallFrame = refreshed;
    }
  }
}
'''

start_poll = text.find("/** Khi đã vào bàn, browser vẫn có cookie hợp lệ — poll Hall qua axios + cookie để DB có ván mới + emit capture. */")
if start_poll < 0:
    if "HALL POLL LOBBY" in text:
        print("SKIP: pollHall already lobby-aware")
    else:
        raise SystemExit("poll start not found")
else:
    hb = text.find("\nfunction startActiveTableHeartbeat()", start_poll)
    if hb < 0:
        raise SystemExit("heartbeat marker not found")
    text = text[:start_poll] + new_poll + text[hb:]
    print("OK: replaced pollHallFromBrowserAndIngest")

marker = "stay lobby — skip enter table"
if marker in text:
    print("SKIP: AUTO ENTER already gated")
else:
    start = text.find("    // VÀO NGAY 1 BÀN BACCARAT")
    if start < 0:
        raise SystemExit("AUTO ENTER comment not found")
    # end at the startBaccaratCycle comment line (inclusive)
    sc = text.find("    // Dừng chu kỳ tự cuộn ngầm (startBaccaratCycle)", start)
    if sc < 0:
        raise SystemExit("end marker not found")
    end2 = text.find("\n", text.find("startBaccaratCycle", sc))
    if end2 < 0:
        raise SystemExit("startBaccaratCycle line end not found")
    old_block = text[start : end2 + 1]
    indented = "\n".join(("  " + ln if ln.strip() else ln) for ln in old_block.splitlines())
    new_block = (
        "    // HALL_ONLY: ở lại sảnh forward hall API — không vào bàn / không capture\n"
        "    if (isHallOnlyMode()) {\n"
        "      currentInTable = null;\n"
        "      await clearActiveTableOnServer().catch(() => {});\n"
        "      await helper.appendToLog(\n"
        '        "🏛️ [HALL ONLY] Ở lại sảnh — không vào bàn (chỉ forward hall API)",\n'
        "        logsNameProgress\n"
        "      );\n"
        "      console.log(\n"
        '        "[HALL ONLY] " + nameServiceSocket + " stay lobby — skip enter table"\n'
        "      );\n"
        "      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);\n"
        "      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;\n"
        "      startActiveTableHeartbeat();\n"
        "    } else {\n"
        + indented
        + "\n    }\n"
    )
    text = text[:start] + new_block + text[end2 + 1 :]
    print("OK: gated AUTO ENTER with HALL_ONLY")

p.write_text(text, encoding="utf-8")
print("WROTE", p)
print("has_lobby_poll", "HALL POLL LOBBY" in text)
print("has_hall_only_gate", marker in text)
print("has_helper", "function isHallOnlyMode" in text)
