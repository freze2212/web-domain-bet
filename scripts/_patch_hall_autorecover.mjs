import { Client } from "ssh2";
import fs from "fs";

const FILE = "/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js";

const patchScript = `
const fs = require('fs');
const path = ${JSON.stringify(FILE)};
const bak = path + '.bak-hall-recover-' + Date.now();
let src = fs.readFileSync(path, 'utf8');
fs.writeFileSync(bak, src);
console.log('BACKUP', bak);

// 1) Add state vars near lastHallIngestAt
if (!src.includes('let hallDetachStreak')) {
  if (!src.includes('let lastHallIngestAt = 0;')) {
    throw new Error('anchor lastHallIngestAt missing');
  }
  src = src.replace(
    'let lastHallIngestAt = 0;',
    \`let lastHallIngestAt = 0;
let hallDetachStreak = 0;
let hallRecoverInFlight = false;
const HALL_STALE_RESET_MS = Number(process.env.HALL_STALE_RESET_MS || 45000);
const HALL_DETACH_RESET_STREAK = Number(process.env.HALL_DETACH_RESET_STREAK || 3);\`
  );
  console.log('OK added state vars');
} else {
  console.log('SKIP state vars already present');
}

// 2) ingestHallTableItems — mark progress + reset streak
const ingestOld = \`async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  const serverPort = process.env.SERVER_PORT || 3201;
  await axios.post(
    \\\`http://localhost:\\\${serverPort}/api/ingest-hall-data\\\`,
    {
      nameService: nameServiceSocket,
      tableItems,
    },
    { timeout: 15000, maxBodyLength: Infinity }
  );
  console.log(\\\`[HALL FORWARD] \\\${nameServiceSocket} tables=\\\${tableItems.length}\\\`);
  return true;
}\`;

const ingestNew = \`async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now();
  hallDetachStreak = 0;
  const serverPort = process.env.SERVER_PORT || 3201;
  await axios.post(
    \\\`http://localhost:\\\${serverPort}/api/ingest-hall-data\\\`,
    {
      nameService: nameServiceSocket,
      tableItems,
    },
    { timeout: 15000, maxBodyLength: Infinity }
  );
  console.log(\\\`[HALL FORWARD] \\\${nameServiceSocket} tables=\\\${tableItems.length}\\\`);
  return true;
}\`;

if (!src.includes('hallDetachStreak = 0;') || !src.includes('async function ingestHallTableItems')) {
  // continue
}
if (src.includes('async function ingestHallTableItems(tableItems)') && !src.includes('hallDetachStreak = 0;\\n  const serverPort')) {
  // use flexible replace on the function body start
  const reIngest = /async function ingestHallTableItems\\(tableItems\\) \\{[\\s\\S]*?\\n  return true;\\n\\}/;
  if (!reIngest.test(src)) throw new Error('ingestHallTableItems block not found');
  src = src.replace(reIngest, ingestNew.replace(/\\\\\`/g, '\`').replace(/\\\\\$/g, '$'));
  console.log('OK patched ingestHallTableItems');
} else if (src.includes('hallDetachStreak = 0;') && src.includes('lastSessionProgressAt = Date.now();\\n  hallDetachStreak')) {
  console.log('SKIP ingest already patched');
} else {
  const reIngest = /async function ingestHallTableItems\\(tableItems\\) \\{[\\s\\S]*?\\n  return true;\\n\\}/;
  if (!reIngest.test(src)) throw new Error('ingestHallTableItems block not found');
  src = src.replace(reIngest, \`async function ingestHallTableItems(tableItems) {
  if (!Array.isArray(tableItems) || !tableItems.length) return false;
  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now();
  hallDetachStreak = 0;
  const serverPort = process.env.SERVER_PORT || 3201;
  await axios.post(
    \\\`http://localhost:\\\${serverPort}/api/ingest-hall-data\\\`,
    {
      nameService: nameServiceSocket,
      tableItems,
    },
    { timeout: 15000, maxBodyLength: Infinity }
  );
  console.log(\\\`[HALL FORWARD] \\\${nameServiceSocket} tables=\\\${tableItems.length}\\\`);
  return true;
}\`.replace(/\\\\\`/g, '\`').replace(/\\\\\$/g, '$'));
  console.log('OK patched ingestHallTableItems (branch2)');
}

// 3) Replace startActiveTableHeartbeat — no fake progress; stale/detach recover
const reHb = /function startActiveTableHeartbeat\\(\\) \\{[\\s\\S]*?\\}, 2000\\);\\n\\}/;
if (!reHb.test(src)) throw new Error('startActiveTableHeartbeat not found');

const hbNew = \`function startActiveTableHeartbeat() {
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
    \\\`[HALL AUTO-RECOVER] \\\${nameServiceSocket} table=\\\${currentInTable} staleMs=\\\${Math.round(
      staleMs / 1000
    )}s detachStreak=\\\${hallDetachStreak} — resetMain\\\`
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
}\`;

src = src.replace(reHb, hbNew.replace(/\\\\\`/g, '\`').replace(/\\\\\$/g, '$'));
console.log('OK patched heartbeat + maybeRecoverStaleHall');

// 4) Enhance pollHallFromBrowserAndIngest catch / no-json to count detach
// Patch the catch block at end of pollHallFromBrowserAndIngest
const reCatch = /async function pollHallFromBrowserAndIngest\\(\\) \\{[\\s\\S]*?\\} catch \\(e\\) \\{\\s*if \\(Date\\.now\\(\\) - lastHallShapeLogAt > 15000\\) \\{[\\s\\S]*?console\\.log\\(\\\`\\[HALL POLL IN-TABLE\\] \\\${currentInTable} err=\\\${e\\.message}\\\\\`\\);\\s*\\}\\s*\\}\\s*\\}/;

if (!reCatch.test(src)) {
  console.log('WARN poll catch regex miss — trying softer patch');
} else {
  // Will replace whole function below
}

const rePoll = /async function pollHallFromBrowserAndIngest\\(\\) \\{[\\s\\S]*?\\n\\}\\n\\nfunction startActiveTableHeartbeat/;
if (!rePoll.test(src)) {
  // after our replace, maybeRecover is between poll and... wait we already replaced heartbeat.
  // poll function should still be intact before maybeRecover
}

// Re-read approach: replace poll function by finding start and end before maybeRecover or startActiveTableHeartbeat
const pollStart = src.indexOf('async function pollHallFromBrowserAndIngest()');
if (pollStart < 0) throw new Error('pollHallFromBrowserAndIngest missing');
let pollEndMarker = src.indexOf('\\nasync function maybeRecoverStaleHall', pollStart);
if (pollEndMarker < 0) pollEndMarker = src.indexOf('\\nfunction startActiveTableHeartbeat', pollStart);
if (pollEndMarker < 0) throw new Error('poll end marker missing');

const pollNew = \`async function pollHallFromBrowserAndIngest() {
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
        \\\`[HALL POLL IN-TABLE] \\\${currentInTable} \\\${kind}\\\${detail ? " " + detail : ""} streak=\\\${hallDetachStreak}\\\`
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
        pollPreview = \\\`status=\\\${hit.status} preview=\\\${String(hit.preview || "").replace(/\\\\s+/g, " ")}\\\`;
      } catch (fe) {
        const m = fe && fe.message ? fe.message : String(fe);
        if (/detached|Target closed|Execution context was destroyed/i.test(m)) {
          sawDetach = true;
        }
        pollPreview = m;
      }
    }
    if (!hallData || typeof hallData !== "object") {
      noteHallFail(sawDetach ? "err=frame.evaluate: Frame was detached" : "no-json", pollPreview);
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
    noteHallFail(\\\`err=\\\${e.message}\\\`);
  }
}
\`;

src = src.slice(0, pollStart) + pollNew.replace(/\\\\\`/g, '\`').replace(/\\\\\$/g, '$').replace(/\\\\\\\\s/g, '\\s') + src.slice(pollEndMarker);
console.log('OK patched pollHallFromBrowserAndIngest');

fs.writeFileSync(path, src);
console.log('WROTE', path, 'bytes', src.length);

// sanity
const checks = [
  'maybeRecoverStaleHall',
  'hallDetachStreak',
  'HALL_STALE_RESET_MS',
  'KHÔNG cập nhật lastSessionProgressAt giả',
];
for (const c of checks) {
  if (!src.includes(c)) throw new Error('missing after patch: ' + c);
  console.log('CHECK OK', c);
}
`;

const remoteCmd = `
node <<'NODE'
${patchScript}
NODE
echo
echo '===== RESTART session_sexy_2 ====='
pm2 restart session_sexy_2 --update-env
sleep 6
pm2 show session_sexy_2 | grep -iE 'status|uptime|restart|created|script'
echo
tail -n 20 /root/.pm2/logs/session-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remoteCmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
