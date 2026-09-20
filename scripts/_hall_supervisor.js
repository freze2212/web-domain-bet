/**
 * Out-of-process 24/7 guard for NS2 hall ingest.
 * Playwright trong session có thể treo im. Process này chỉ nhìn stamp DB.
 * Đứng quá HALL_STALE_MS → pm2 restart session_sexy_2 (cooldown).
 */
const { execFile } = require("child_process");
const http = require("http");

const TABLES = (process.env.HALL_WATCH_TABLES || "C01,C03,C05,C02").split(",");
const API = process.env.HALL_API || "http://127.0.0.1:3201";
const STALE_MS = Number(process.env.HALL_STALE_MS || 150000);
const POLL_MS = Number(process.env.HALL_SUPERVISOR_POLL_MS || 45000);
const COOLDOWN_MS = Number(process.env.HALL_RESTART_COOLDOWN_MS || 180000);
const TARGET = process.env.HALL_PM2_TARGET || "session_sexy_2";

let lastSeen = 0;
let lastRestartAt = 0;
let bootGraceUntil = Date.now() + 120000;

function getTable(name) {
  return new Promise((resolve, reject) => {
    const url = `${API}/predict/get-table-by-name?tableName=${encodeURIComponent(name)}`;
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(b));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function maxStampFromDoc(d) {
  const x = (d && (d.table || d.data)) || d || {};
  const rounds = x.totalRound || [];
  let max = 0;
  for (const r of rounds) {
    const s = Number(r && r.stampTime);
    if (s > max) max = s;
  }
  return max;
}

function restartSession() {
  return new Promise((resolve) => {
    execFile("pm2", ["restart", TARGET, "--update-env"], (err, stdout, stderr) => {
      console.log(
        `[SUPERVISOR] pm2 restart ${TARGET} err=${err ? err.message : "ok"}`
      );
      if (stdout) console.log(String(stdout).slice(0, 400));
      if (stderr) console.log(String(stderr).slice(0, 200));
      resolve(!err);
    });
  });
}

async function tick() {
  const now = Date.now();
  let max = 0;
  let okTables = 0;
  for (const t of TABLES) {
    try {
      const d = await getTable(t.trim());
      const s = maxStampFromDoc(d);
      if (s > max) max = s;
      okTables += 1;
    } catch (e) {
      console.log(`[SUPERVISOR] read ${t} fail ${e.message}`);
    }
  }
  if (!max) {
    console.log(`[SUPERVISOR] no stamps tables=${okTables}/${TABLES.length}`);
    return;
  }
  if (max > lastSeen) {
    const age = now - max;
    console.log(
      `[SUPERVISOR] live maxStamp=${max} ageMs=${age} tables=${okTables}`
    );
    lastSeen = max;
    return;
  }
  const stale = now - lastSeen;
  if (now < bootGraceUntil) {
    console.log(`[SUPERVISOR] grace boot leftover stale=${stale}ms`);
    return;
  }
  if (stale < STALE_MS) {
    console.log(`[SUPERVISOR] waiting stamp move stale=${Math.round(stale / 1000)}s`);
    return;
  }
  if (now - lastRestartAt < COOLDOWN_MS) {
    console.log(
      `[SUPERVISOR] hall stale ${Math.round(stale / 1000)}s — cooldown restart`
    );
    return;
  }
  lastRestartAt = now;
  bootGraceUntil = now + 120000;
  console.log(
    `[SUPERVISOR] HALL DEAD stale=${Math.round(stale / 1000)}s maxStamp=${max} — restart ${TARGET}`
  );
  await restartSession();
}

console.log(
  `[SUPERVISOR] start watch=${TABLES.join(",")} stale=${STALE_MS}ms poll=${POLL_MS}ms → ${TARGET}`
);
tick().catch((e) => console.log("[SUPERVISOR] tick", e.message));
setInterval(() => {
  tick().catch((e) => console.log("[SUPERVISOR] tick", e.message));
}, POLL_MS);
