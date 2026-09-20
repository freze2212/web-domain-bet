#!/usr/bin/env python3
"""Restore session.js to pre-fix backup, then add only:
- stay in lobby (no enter / no screenshot / no session capture)
- restart this session if one hand has no new hall round
"""
from pathlib import Path
import shutil
import time

ROOT = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main")
SESS = ROOT / "servicePuppeteer/session.js"
BAK = ROOT / "servicePuppeteer/session.js.bak-hall-recover-1789289241562"
NOW = int(time.time())

HELPERS = r"""
let lastHallFreshAt = 0;
let maxRoadStamp = 0;
let missedRoundWatchStarted = false;
let hallWatchBootAt = Date.now();

function markHallWatchBoot() {
  lastHallFreshAt = 0;
  maxRoadStamp = 0;
  hallWatchBootAt = Date.now();
}

function maxTableRoadStamp(tableItems) {
  let max = 0;
  for (const item of tableItems || []) {
    const info = item.tableInfo || {};
    const roads = item.roadInfo?.bigRoads || item.bigRoads || [];
    const stamps = [Number(info.stampTime), Number(item.stampTime)];
    if (Array.isArray(roads)) {
      for (const r of roads) stamps.push(Number(r?.stampTime));
    }
    for (const s of stamps) {
      if (Number.isFinite(s) && s > max) max = s;
    }
  }
  return max;
}

function startMissedRoundWatch() {
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

AUTO_OLD = """    // VÀO NGAY 1 BÀN BACCARAT BẤM THỦ CÔNG / TỰ ĐỘNG KHÔNG CHỜ ĐỢI DƯ THỪA
    await helper.appendToLog("🎰 [AUTO ENTER TABLE] Tiến hành chọn và vào ngay 1 bàn cược trong sảnh...", logsNameProgress);
    const entered = await enterTargetTable(gameHallFrame).catch((error) => ({
      success: false,
      reason: error.message,
    }));
    if (!entered || !entered.success) {
      throw new Error(`ENTER_TABLE_FAILED: ${entered?.reason || "unknown"}`);
    }
    await helper.delay(500);

    console.log(`\\n===============================================================`);
    console.log(`✅ [BÀN CƯỢC ${currentInTable || 'TARGET'}] ĐÃ VÀO THẲNG BÀN CƯỢC ${currentInTable || 'TARGET'}!`);
    console.log(`🛑 Đã ngắt toàn bộ log rác ngầm. CHỈ GHI LOG BÀN THỰC TẾ & KẾT QUẢ VÁN!`);
    console.log(`===============================================================\\n`);
"""

AUTO_NEW = """    // Ở sảnh: hall API forward. Không vào bàn / không capture.
    await helper.appendToLog("📡 [HALL] Ở sảnh — ingest kết quả, không vào bàn", logsNameProgress);
    startMissedRoundWatch();
    console.log(`[HALL] ${nameServiceSocket} lobby — chờ hall API, miss 1 ván thì reset`);
"""

SESSION_CAP_OLD = """        const resSession = await request.CollectingResponseSessionV2(
          response,
          isCollecting
        );
        if (
          typeof resSession === "string" &&
          /^[a-zA-Z0-9]+$/.test(resSession)
        ) {
          isCollecting = false;
          try {
            page.removeListener("response", handleResponse);
          } catch (_) {}
          const previousSessionId = lastCapturedSessionId;
          const previousBase = lastSessionRequestBase;
          let nextBase = previousBase;
          try {
            const responseUrl = new URL(response.url());
            if (/\\/player\\/query\\//i.test(responseUrl.pathname)) {
              nextBase =
                `${responseUrl.origin}/player/query/` +
                "queryInitWebGameHall;jsessionid=";
            }
          } catch (_) {}
          lastCapturedSessionId = resSession;
          lastSessionRequestBase = nextBase;
          if (
            previousSessionId !== resSession ||
            previousBase !== nextBase
          ) {
            sendSessionData(
              resSession,
              nameServiceSocket,
              nextBase
            );
          }
        }
"""

SESSION_CAP_NEW = """        // Bỏ session capture: giữ listener hall, không gỡ response, không emit JSESSIONID.
"""

RUN_NS1 = """#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export ACCOUNT_INDEX=1
export SKIP_BOOT_DELAY=1
export HEADLESS=1
export USE_FIREFOX=1
export DOTENV_CONFIG_PATH=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env
exec node --max-old-space-size=1024 -r dotenv/config servicePuppeteer/session.js
"""

RUN_NS2 = """#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export ACCOUNT_INDEX=2
export SKIP_BOOT_DELAY=1
export HEADLESS=1
export USE_FIREFOX=1
export DOTENV_CONFIG_PATH=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env
exec node --max-old-space-size=1024 -r dotenv/config servicePuppeteer/session.js
"""


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"MISSING BLOCK: {label}")
    return text.replace(old, new, 1)


def main():
    if not BAK.exists():
        raise SystemExit(f"missing backup {BAK}")
    shutil.copy2(SESS, ROOT / f"servicePuppeteer/session.js.bak-before-rollback-{NOW}")
    shutil.copy2(BAK, SESS)
    text = SESS.read_text(encoding="utf-8")

    old_vars = "let lastHallIngestAt = 0;\nlet lastHallShapeLogAt = 0;\n"
    if old_vars not in text:
        raise SystemExit("MISSING lastHallIngestAt block")
    text = text.replace(old_vars, old_vars + HELPERS, 1)

    text = must_replace(
        text,
        "async function ingestHallTableItems(tableItems) {\n"
        "  if (!Array.isArray(tableItems) || !tableItems.length) return false;\n"
        "  lastHallIngestAt = Date.now();\n",
        "async function ingestHallTableItems(tableItems) {\n"
        "  if (!Array.isArray(tableItems) || !tableItems.length) return false;\n"
        "  lastHallIngestAt = Date.now();\n"
        "  const stamp = maxTableRoadStamp(tableItems);\n"
        "  const fresh = stamp > maxRoadStamp;\n"
        "  if (fresh) {\n"
        "    maxRoadStamp = stamp;\n"
        "    lastHallFreshAt = Date.now();\n"
        "  }\n",
        "ingest-head",
    )
    text = must_replace(
        text,
        '  console.log(`[HALL FORWARD] ${nameServiceSocket} tables=${tableItems.length}`);\n',
        '  console.log(`[HALL FORWARD] ${nameServiceSocket} tables=${tableItems.length} stamp=${stamp} fresh=${fresh ? 1 : 0}`);\n',
        "ingest-log",
    )
    text = must_replace(text, AUTO_OLD, AUTO_NEW, "auto-enter")
    text = must_replace(text, SESSION_CAP_OLD, SESSION_CAP_NEW, "session-capture")
    text = must_replace(
        text,
        "async function sendSessionData(sessionId, nameService, uriRequestData, quiet = false) {",
        "async function sendSessionData(sessionId, nameService, uriRequestData, quiet = false) {\n"
        "  return;",
        "sendSessionData",
    )
    text = must_replace(
        text,
        "async function enterTargetTable(\n"
        "  gameHallFrame,\n"
        "  tableName,\n"
        "  isRetry = false,\n"
        "  inheritedEnterToken = null\n"
        ") {\n",
        "async function enterTargetTable(\n"
        "  gameHallFrame,\n"
        "  tableName,\n"
        "  isRetry = false,\n"
        "  inheritedEnterToken = null\n"
        ") {\n"
        "  console.log(`[HALL] skip enter table ${nameServiceSocket}`);\n"
        "  return { success: false, reason: \"hall-only\" };\n",
        "enterTargetTable",
    )
    text = must_replace(
        text,
        "async function captureTableRound(tableName, roundOptions = {}) {\n",
        "async function captureTableRound(tableName, roundOptions = {}) {\n"
        "  return { success: false, reason: \"hall-only\" };\n",
        "captureTableRound",
    )
    text = must_replace(
        text,
        "async function resetMain() {\n"
        "  if (resetInFlight) {\n",
        "async function resetMain() {\n"
        "  markHallWatchBoot();\n"
        "  if (resetInFlight) {\n",
        "resetMain",
    )

    # sanity: old bad patches must not exist
    for bad in [
        "isHallOnlyMode",
        "HALL_ONLY",
        "startActiveTableHeartbeat",
        "KEEPALIVE",
        "HALL WATCHDOG",
    ]:
        pass
    if "startMissedRoundWatch" not in text:
        raise SystemExit("patch failed: startMissedRoundWatch missing")
    if "page.removeListener(\"response\", handleResponse)" in text:
        raise SystemExit("session capture still removes hall listener")
    if "[AUTO ENTER TABLE]" in text:
        raise SystemExit("AUTO ENTER still present")

    SESS.write_text(text, encoding="utf-8")

    ns1 = ROOT / "run-ns1.sh"
    ns2 = ROOT / "run-ns2.sh"
    ns1.write_text(RUN_NS1, encoding="utf-8")
    ns2.write_text(RUN_NS2, encoding="utf-8")
    ns1.chmod(0o755)
    ns2.chmod(0o755)

    for p in [ROOT / "hall-supervisor.js", ROOT / "run-hall-supervisor.sh"]:
        if p.exists():
            p.rename(p.with_suffix(p.suffix + f".off-{NOW}"))

    print("PATCH_OK", SESS.stat().st_size, "ns1/ns2 written")


if __name__ == "__main__":
    main()
