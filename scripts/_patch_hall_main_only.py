from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# ========== 1) HALL_ONLY boot ==========
old_boot_start = text.find("    // HALL_ONLY:")
if old_boot_start < 0:
    raise SystemExit("HALL_ONLY boot start not found")
else_marker = "    } else {\n      // VÀO NGAY 1 BÀN"
else_pos = text.find(else_marker, old_boot_start)
if else_pos < 0:
    else_marker = "    } else {\n      // VÀO NGAY"
    else_pos = text.find(else_marker, old_boot_start)
if else_pos < 0:
    raise SystemExit("else enter marker not found")

new_boot = """    // HALL_ONLY: chỉ sảnh + forward hall API (24/7). Không vào bàn / hô / đặt / capture.
    if (isHallOnlyMode()) {
      currentInTable = null;
      await clearActiveTableOnServer().catch(() => {});
      await helper.appendToLog(
        "🏛️ [HALL ONLY] Ở lại sảnh — chỉ forward hall API (no enter/hô/bet/cap)",
        logsNameProgress
      );
      console.log(
        "[HALL ONLY] " + nameServiceSocket + " lobby-only — hall ingest 24/7"
      );
      const hallRefreshOnly = await resolveGameHallFrame().catch(() => null);
      if (hallRefreshOnly) gameHallFrame = hallRefreshOnly;
      startHallOnlyKeepalive();
"""
text = text[:old_boot_start] + new_boot + text[else_pos:]
print("OK: boot")

# ========== 2) Replace poll + heartbeat ==========
poll_start = text.find("/** Poll Hall API.")
if poll_start < 0:
    poll_start = text.find("async function pollHallFromBrowserAndIngest()")
    cmt = text.rfind("/**", max(0, poll_start - 500), poll_start)
    if cmt > 0:
        poll_start = cmt

hb_pos = text.find("\nfunction startActiveTableHeartbeat()", poll_start)
if hb_pos < 0:
    raise SystemExit("heartbeat missing")

brace = 0
started = False
m_end = None
for i, ch in enumerate(text[hb_pos:]):
    if ch == "{":
        brace += 1
        started = True
    elif ch == "}":
        brace -= 1
        if started and brace == 0:
            m_end = hb_pos + i + 1
            break
if not m_end:
    raise SystemExit("heartbeat end missing")

new_hall_fns = r'''/** Poll Hall từ iframe sảnh (đúng origin). Detach → rebind, không resetMain tại đây. */
async function pollHallFromBrowserAndIngest() {
  if (!page || page.isClosed()) return false;
  if (!isHallOnlyMode() && !currentInTable) return false;
  if (Date.now() - lastHallIngestAt < 800) return true;
  const base =
    lastSessionRequestBase ||
    process.env.URI_REQUEST_DATA ||
    "";
  if (!base) return false;

  const logTag = isHallOnlyMode() ? "HALL POLL LOBBY" : "HALL POLL IN-TABLE";
  const where = isHallOnlyMode() ? "LOBBY" : currentInTable;

  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return false;
    const url = (lastSessionRequestBase || base) + jsess;

    if (isHallOnlyMode()) {
      if (
        !gameHallFrame ||
        (typeof gameHallFrame.isClosed === "function" && gameHallFrame.isClosed())
      ) {
        const refreshed = await resolveGameHallFrame().catch(() => null);
        if (refreshed) gameHallFrame = refreshed;
      }
    }

    const frames = isHallOnlyMode()
      ? [gameHallFrame, seamlessFrame].filter(Boolean)
      : [gameCurrentFrame, seamlessFrame, gameHallFrame].filter(Boolean);

    let hallData = null;
    let pollPreview = "";

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
              return {
                ok: false,
                status: r.status,
                preview: String(text || "").slice(0, 100),
              };
            }
          }, url),
          8000,
          null
        );
      } catch (evErr) {
        pollPreview = "evaluate=" + (evErr.message || evErr);
        if (isHallOnlyMode()) {
          const refreshed = await resolveGameHallFrame().catch(() => null);
          if (refreshed) gameHallFrame = refreshed;
        }
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

    if (!hallData || typeof hallData !== "object") {
      if (Date.now() - lastHallShapeLogAt > 20000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " no-json " + pollPreview);
      }
      return false;
    }
    const tableItems =
      hallData?.tableItems ||
      hallData?.data?.tableItems ||
      hallData?.result?.tableItems;
    if (!Array.isArray(tableItems) || !tableItems.length) {
      if (Date.now() - lastHallShapeLogAt > 20000) {
        lastHallShapeLogAt = Date.now();
        console.log("[" + logTag + "] " + where + " empty tables");
      }
      return false;
    }
    await ingestHallTableItems(tableItems);
    return true;
  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 20000) {
      lastHallShapeLogAt = Date.now();
      console.log("[" + logTag + "] " + where + " err=" + e.message);
    }
    if (isHallOnlyMode()) {
      const refreshed = await resolveGameHallFrame().catch(() => null);
      if (refreshed) gameHallFrame = refreshed;
    }
    return false;
  }
}

function startActiveTableHeartbeat() {
  if (activeTableHeartbeatTimer) clearInterval(activeTableHeartbeatTimer);
  activeTableHeartbeatTimer = setInterval(() => {
    lastSessionProgressAt = Date.now();
    pollHallFromBrowserAndIngest().catch(() => {});
  }, 2000);
}

/** Keepalive 24/7 HALL_ONLY: poll + soft recover + hard reset nếu hall chết lâu. */
let hallKeepaliveRunning = false;
function startHallOnlyKeepalive() {
  if (activeTableHeartbeatTimer) clearInterval(activeTableHeartbeatTimer);
  console.log("[HALL KEEPALIVE] started for " + nameServiceSocket);
  activeTableHeartbeatTimer = setInterval(() => {
    if (hallKeepaliveRunning) return;
    hallKeepaliveRunning = true;
    (async () => {
      try {
        const ok = await pollHallFromBrowserAndIngest();
        const staleMs = Date.now() - (lastHallIngestAt || 0);

        if (ok || staleMs < 15000) {
          lastSessionProgressAt = Date.now();
          return;
        }

        if (staleMs >= 15000 && staleMs < 45000) {
          const refreshed = await resolveGameHallFrame().catch(() => null);
          if (refreshed) gameHallFrame = refreshed;
          const ok2 = await pollHallFromBrowserAndIngest();
          if (ok2) lastSessionProgressAt = Date.now();
          else if (Date.now() - lastHallShapeLogAt > 20000) {
            lastHallShapeLogAt = Date.now();
            console.log(
              "[HALL KEEPALIVE] rebind stale=" + Math.round(staleMs / 1000) + "s"
            );
          }
          return;
        }

        if (staleMs >= 45000 && staleMs < 120000) {
          console.log(
            "[HALL KEEPALIVE] soft recover lobby stale=" +
              Math.round(staleMs / 1000) +
              "s"
          );
          lastSessionProgressAt = Date.now();
          await recoverHallViaLiveLobby().catch((e) =>
            console.log("[HALL KEEPALIVE] soft recover err=" + e.message)
          );
          await waitSeamlessSrcOrHall(12).catch(() => {});
          await bindSeamlessFrame().catch(() => {});
          gameHallFrame = await waitForGameHall(3).catch(() => null);
          await pollHallFromBrowserAndIngest();
          return;
        }

        console.log(
          "[HALL KEEPALIVE] hard resetMain — hall stale " +
            Math.round(staleMs / 1000) +
            "s"
        );
        lastSessionProgressAt = Date.now();
        await resetMain().catch((e) =>
          console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
        );
      } catch (e) {
        console.log("[HALL KEEPALIVE] err=" + e.message);
      } finally {
        hallKeepaliveRunning = false;
      }
    })();
  }, 2500);
}
'''

text = text[:poll_start] + new_hall_fns + text[m_end:]
print("OK: poll/keepalive")

# ========== 3) Guards — inject AFTER ") {" of function signature ==========
def inject_after_sig(src, fn_name, guard_block):
    i = src.find(fn_name)
    if i < 0:
        print("MISS", fn_name)
        return src
    # find ") {" or "){" that closes params — skip nested braces in defaults carefully
    # Prefer last ") {" before body: scan from i until we see ") {" at depth 0 for parens
    depth = 0
    j = src.find("(", i)
    if j < 0:
        print("no paren", fn_name)
        return src
    k = j
    while k < len(src):
        ch = src[k]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                # expect optional whitespace then {
                m = k + 1
                while m < len(src) and src[m] in " \t\r\n":
                    m += 1
                if m < len(src) and src[m] == "{":
                    insert_at = m + 1
                    if "isHallOnlyMode()" in src[insert_at : insert_at + 180]:
                        print("SKIP already", fn_name)
                        return src
                    src = src[:insert_at] + "\n" + guard_block + src[insert_at:]
                    print("OK guard", fn_name)
                    return src
                break
        k += 1
    print("FAIL guard", fn_name)
    return src

text = inject_after_sig(
    text,
    "async function runPlaceBetCommand",
    '  if (isHallOnlyMode()) {\n    console.log("[HALL ONLY] skip place bet");\n    return false;\n  }\n',
)
text = inject_after_sig(
    text,
    "async function captureTableRound",
    '  if (isHallOnlyMode()) {\n    console.log("[HALL ONLY] skip capture");\n    return null;\n  }\n',
)
text = inject_after_sig(
    text,
    "async function enterTargetTable",
    '  if (isHallOnlyMode()) {\n    console.log("[HALL ONLY] skip enterTargetTable");\n    return { success: false, reason: "hall_only" };\n  }\n',
)

p.write_text(text, encoding="utf-8")
print("WROTE", p)
