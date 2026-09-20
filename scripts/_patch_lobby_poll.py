#!/usr/bin/env python3
from pathlib import Path

P = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
t = P.read_text(encoding="utf-8")

OLD_WATCH = """function startMissedRoundWatch() {
  if (missedRoundWatchStarted) return;
  missedRoundWatchStarted = true;
  setInterval(() => {
    if (resetInFlight) return;
    const MISS_MS = Number(process.env.HALL_MISS_HAND_MS || 70000) + Math.max(0, accountIdx - 1) * 35000;
    const BOOT_MS = Number(process.env.HALL_BOOT_GRACE_MS || 90000) + Math.max(0, accountIdx - 1) * 20000;
    const now = Date.now();
    if (!lastHallFreshAt) {
      if (now - hallWatchBootAt > BOOT_MS) {
        console.log(
          `[HALL MISS] ${nameServiceSocket} không có ván mới sau boot ${Math.round((now - hallWatchBootAt) / 1000)}s — reset session`
        );
        markHallWatchBoot();
        resetMain().catch((e) => console.error("[HALL MISS]", e.message));
      }
      return;
    }
    const age = now - lastHallFreshAt;
    if (age > MISS_MS) {
      console.log(
        `[HALL MISS] ${nameServiceSocket} không cập nhật ván mới ${Math.round(age / 1000)}s — reset session`
      );
      markHallWatchBoot();
      resetMain().catch((e) => console.error("[HALL MISS]", e.message));
    }
  }, 5000);
}
"""

NEW_WATCH = """let lobbyPollFail = 0;
let lobbyPollTimer = null;

function startLobbyHallPoll() {
  if (lobbyPollTimer) clearInterval(lobbyPollTimer);
  lobbyPollFail = 0;
  lobbyPollTimer = setInterval(() => {
    pollLobbyHall().catch((e) => console.error("[HALL POLL]", e.message));
  }, 2000);
  console.log(`[HALL POLL] ${nameServiceSocket} poll sảnh mỗi 2s — chỉ reset khi poll chết`);
}

async function pollLobbyHall() {
  if (resetInFlight || !page || page.isClosed()) return;
  const ok = await pollHallFromBrowserAndIngest();
  if (ok) {
    lobbyPollFail = 0;
    return;
  }
  lobbyPollFail += 1;
  if (lobbyPollFail === 1 || lobbyPollFail % 4 === 0) {
    console.log(`[HALL POLL FAIL] ${nameServiceSocket} ${lobbyPollFail}/8`);
  }
  if (lobbyPollFail >= 8) {
    console.log(`[HALL POLL DEAD] ${nameServiceSocket} poll chết 8 lần — reset browser`);
    lobbyPollFail = 0;
    resetMain().catch((e) => console.error("[HALL POLL DEAD]", e.message));
  }
}
"""

if OLD_WATCH not in t:
    raise SystemExit("startMissedRoundWatch block missing")
t = t.replace(OLD_WATCH, NEW_WATCH, 1)

OLD_POLL = """async function pollHallFromBrowserAndIngest() {
  if (!page || page.isClosed() || !currentInTable) return;
  if (Date.now() - lastHallIngestAt < 900) return;
  const base =
    lastSessionRequestBase ||
    process.env.URI_REQUEST_DATA ||
    "";
  if (!base) return;
  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return;
    const hallBase = lastSessionRequestBase || base;
    const url = hallBase + jsess;
    const frames = [gameCurrentFrame, seamlessFrame, gameHallFrame].filter(Boolean);
"""

NEW_POLL = """async function pollHallFromBrowserAndIngest() {
  if (!page || page.isClosed()) return false;
  if (Date.now() - lastHallIngestAt < 900) return true;
  const base =
    lastSessionRequestBase ||
    process.env.URI_REQUEST_DATA ||
    "";
  if (!base) return false;
  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return false;
    const hallBase = lastSessionRequestBase || base;
    const url = hallBase + jsess;
    const frames = [gameHallFrame, seamlessFrame, gameCurrentFrame, page].filter(Boolean);
"""

if OLD_POLL not in t:
    raise SystemExit("pollHall head missing")
t = t.replace(OLD_POLL, NEW_POLL, 1)

t = t.replace(
    """        console.log(`[HALL POLL IN-TABLE] ${currentInTable} no-json ${pollPreview}`);
      }
      return;
    }""",
    """        console.log(`[HALL POLL] ${nameServiceSocket} no-json ${pollPreview}`);
      }
      return false;
    }""",
    1,
)
t = t.replace(
    """        console.log(`[HALL POLL IN-TABLE] ${currentInTable} empty tables`);
      }
      return;
    }
    await ingestHallTableItems(tableItems);
  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL IN-TABLE] ${currentInTable} err=${e.message}`);
    }
  }
}""",
    """        console.log(`[HALL POLL] ${nameServiceSocket} empty tables`);
      }
      return false;
    }
    return ingestHallTableItems(tableItems);
  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL] ${nameServiceSocket} err=${e.message}`);
    }
    return false;
  }
}""",
    1,
)

OLD_LOBBY = """    await helper.appendToLog("📡 [HALL] Ở sảnh — ingest kết quả, không vào bàn", logsNameProgress);
    startMissedRoundWatch();
    console.log(`[HALL] ${nameServiceSocket} lobby — chờ hall API, miss 1 ván thì reset`);
"""
NEW_LOBBY = """    await helper.appendToLog("📡 [HALL] Ở sảnh — poll hall API, không vào bàn", logsNameProgress);
    startLobbyHallPoll();
    console.log(`[HALL] ${nameServiceSocket} lobby — poll API mỗi 2s`);
"""
if OLD_LOBBY not in t:
    raise SystemExit("lobby stay block missing")
t = t.replace(OLD_LOBBY, NEW_LOBBY, 1)

OLD_URL = """          const url = response.url();
          const status = response.status();
"""
NEW_URL = """          const url = response.url();
          const status = response.status();
          try {
            const u = new URL(url);
            if (/\\/player\\/query\\//i.test(u.pathname)) {
              lastSessionRequestBase =
                `${u.origin}/player/query/queryInitWebGameHall;jsessionid=`;
              const m = String(url).match(/jsessionid=([A-Za-z0-9]+)/i);
              if (m) lastCapturedSessionId = m[1];
            }
          } catch (_) {}
"""
if OLD_URL not in t:
    raise SystemExit("handleResponse url block missing")
t = t.replace(OLD_URL, NEW_URL, 1)

t = t.replace(
    """function markHallWatchBoot() {
  lastHallFreshAt = 0;
  maxRoadStamp = 0;
  hallWatchBootAt = Date.now();
}""",
    """function markHallWatchBoot() {
  lastHallFreshAt = 0;
  maxRoadStamp = 0;
  hallWatchBootAt = Date.now();
  lobbyPollFail = 0;
}""",
    1,
)

t = t.replace(
    "  return; // chỉ reset khi miss 1 ván hall (startMissedRoundWatch)\n",
    "  return; // lobby poll lo hall; chỉ reset khi poll chết\n",
    1,
)

if "function startMissedRoundWatch" in t or "startMissedRoundWatch()" in t:
    raise SystemExit("startMissedRoundWatch still referenced")
if "[HALL MISS]" in t:
    raise SystemExit("HALL MISS still present")
if "startLobbyHallPoll" not in t:
    raise SystemExit("startLobbyHallPoll missing")
if "if (!page || page.isClosed() || !currentInTable) return;" in t:
    raise SystemExit("poll still requires in-table")

P.write_text(t, encoding="utf-8")
print("PATCH_OK", P.stat().st_size)
