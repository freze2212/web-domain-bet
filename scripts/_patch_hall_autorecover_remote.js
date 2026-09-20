const fs = require("fs");

const path =
  "/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js";
const bak = `${path}.bak-hall-recover-${Date.now()}`;
let src = fs.readFileSync(path, "utf8");
fs.writeFileSync(bak, src);
console.log("BACKUP", bak);

if (!src.includes("let lastHallIngestAt = 0;")) {
  throw new Error("anchor lastHallIngestAt missing");
}

if (!src.includes("let hallDetachStreak")) {
  src = src.replace(
    "let lastHallIngestAt = 0;",
    `let lastHallIngestAt = 0;
let hallDetachStreak = 0;
let hallRecoverInFlight = false;
const HALL_STALE_RESET_MS = Number(process.env.HALL_STALE_RESET_MS || 45000);
const HALL_DETACH_RESET_STREAK = Number(process.env.HALL_DETACH_RESET_STREAK || 3);`
  );
  console.log("OK state vars");
} else {
  console.log("SKIP state vars");
}

const ingestRe =
  /async function ingestHallTableItems\(tableItems\) \{[\s\S]*?\n  return true;\n\}/;
if (!ingestRe.test(src)) throw new Error("ingestHallTableItems not found");
src = src.replace(
  ingestRe,
  `async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now();
  hallDetachStreak = 0;
  const serverPort = process.env.SERVER_PORT || 3201;
  await axios.post(
    \`http://localhost:\${serverPort}/api/ingest-hall-data\`,
    {
      nameService: nameServiceSocket,
      tableItems,
    },
    { timeout: 15000, maxBodyLength: Infinity }
  );
  console.log(\`[HALL FORWARD] \${nameServiceSocket} tables=\${tableItems.length}\`);
  return true;
}`
);
console.log("OK ingestHallTableItems");

const pollStart = src.indexOf("async function pollHallFromBrowserAndIngest()");
if (pollStart < 0) throw new Error("pollHallFromBrowserAndIngest missing");
const hbStart = src.indexOf("function startActiveTableHeartbeat()", pollStart);
if (hbStart < 0) throw new Error("startActiveTableHeartbeat missing");

// Find end of startActiveTableHeartbeat: first "}, 2000);" after hbStart then closing }
const hbClose = src.indexOf("}, 2000);", hbStart);
if (hbClose < 0) throw new Error("heartbeat interval close missing");
const afterHb = src.indexOf("\n}", hbClose);
if (afterHb < 0) throw new Error("heartbeat function close missing");
const hbEnd = afterHb + 2; // include \n}

const replacement = `async function pollHallFromBrowserAndIngest() {
  if (!page || page.isClosed() || !currentInTable) return;
  if (Date.now() - lastHallIngestAt < 900) return;
  const base =
    lastSessionRequestBase ||
    process.env.URI_REQUEST_DATA ||
    "";
  if (!base) return;
  const noteHallFail = (kind, detail = "") => {
    const msg = String(detail || "");
    const isDetach = /detached|Target closed|frame was detached|Execution context was destroyed|Session closed|page has been closed/i.test(
      msg + " " + kind
    );
    if (isDetach) hallDetachStreak += 1;
    else hallDetachStreak = Math.min(hallDetachStreak + 1, HALL_DETACH_RESET_STREAK);
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(
        \`[HALL POLL IN-TABLE] \${currentInTable} \${kind}\${detail ? " " + detail : ""} streak=\${hallDetachStreak}\`
      );
    }
  };
  try {
    const cookies = await page.context().cookies();
    const jsess =
      cookies.find((c) => String(c.name).toUpperCase() === "JSESSIONID")?.value ||
      lastCapturedSessionId;
    if (!jsess) return;
    const hallBase = lastSessionRequestBase || base;
    const url = hallBase + jsess;
    const frames = [gameCurrentFrame, seamlessFrame, gameHallFrame].filter(Boolean);
    let hallData = null;
    let pollPreview = "";
    let sawDetach = false;
    for (const frame of frames) {
      if (!frame || (typeof frame.isClosed === "function" && frame.isClosed())) continue;
      if (typeof frame.isDetached === "function" && frame.isDetached()) {
        sawDetach = true;
        continue;
      }
      try {
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
        pollPreview = \`status=\${hit.status} preview=\${String(hit.preview || "").replace(/\\s+/g, " ")}\`;
      } catch (fe) {
        const m = fe && fe.message ? fe.message : String(fe);
        if (/detached|Target closed|Execution context was destroyed/i.test(m)) {
          sawDetach = true;
        }
        pollPreview = m;
      }
    }
    if (!hallData || typeof hallData !== "object") {
      noteHallFail(
        sawDetach ? "err=frame.evaluate: Frame was detached" : "no-json",
        pollPreview
      );
      return;
    }
    const tableItems =
      hallData?.tableItems ||
      hallData?.data?.tableItems ||
      hallData?.result?.tableItems;
    if (!Array.isArray(tableItems) || !tableItems.length) {
      noteHallFail("empty tables");
      return;
    }
    await ingestHallTableItems(tableItems);
  } catch (e) {
    noteHallFail(\`err=\${e.message}\`);
  }
}

function startActiveTableHeartbeat() {
  if (activeTableHeartbeatTimer) clearInterval(activeTableHeartbeatTimer);
  activeTableHeartbeatTimer = setInterval(() => {
    // KHÔNG cập nhật lastSessionProgressAt giả — chỉ khi HALL FORWARD thật.
    pollHallFromBrowserAndIngest().catch(() => {});
    maybeRecoverStaleHall().catch((e) =>
      console.error("[HALL RECOVER]", e.message)
    );
  }, 2000);
}

async function maybeRecoverStaleHall() {
  if (
    hallRecoverInFlight ||
    resetInFlight ||
    shutdownInFlight ||
    watchdogResetting ||
    sessionRecovering ||
    mainInFlight ||
    enterInFlight ||
    !page ||
    (typeof page.isClosed === "function" && page.isClosed())
  ) {
    return;
  }
  if (!currentInTable || !sessionInTableReady) return;
  const staleMs = Date.now() - (lastHallIngestAt || 0);
  const detachHit = hallDetachStreak >= HALL_DETACH_RESET_STREAK;
  const staleHit = lastHallIngestAt > 0 && staleMs >= HALL_STALE_RESET_MS;
  if (!detachHit && !staleHit) return;

  hallRecoverInFlight = true;
  console.error(
    \`[HALL AUTO-RECOVER] \${nameServiceSocket} table=\${currentInTable} staleMs=\${Math.round(
      staleMs / 1000
    )}s detachStreak=\${hallDetachStreak} — resetMain\`
  );
  try {
    await clearActiveTableOnServer().catch(() => {});
    await resetMain();
  } finally {
    hallDetachStreak = 0;
    lastHallIngestAt = Date.now();
    lastSessionProgressAt = Date.now();
    hallRecoverInFlight = false;
  }
}`;

src = src.slice(0, pollStart) + replacement + src.slice(hbEnd);
fs.writeFileSync(path, src);
console.log("WROTE", path, src.length);

for (const c of [
  "maybeRecoverStaleHall",
  "hallDetachStreak",
  "HALL_STALE_RESET_MS",
  "KHÔNG cập nhật lastSessionProgressAt giả",
  "HALL AUTO-RECOVER",
]) {
  if (!src.includes(c)) throw new Error("missing: " + c);
  console.log("CHECK", c);
}

try {
  new Function(src);
  console.log("SYNTAX OK (Function wrap)");
} catch (e) {
  // session.js uses import/top-level await maybe — Function may fail for ESM
  console.log("Function wrap note:", e.message.slice(0, 120));
}
console.log("DONE");
