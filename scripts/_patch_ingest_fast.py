#!/usr/bin/env python3
from pathlib import Path

SESS = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
SRV = Path("/var/www/tool-baccarat-v2-scratch-data/server.js")

st = SESS.read_text(encoding="utf-8")
old = """  const stamp = maxTableRoadStamp(tableItems);
  const fresh = stamp > maxRoadStamp;
  if (fresh) {
    maxRoadStamp = stamp;
    lastHallFreshAt = Date.now();
  }
  const serverPort = process.env.SERVER_PORT || 3201;
  await axios.post(
    `http://localhost:${serverPort}/api/ingest-hall-data`,
    {
      nameService: nameServiceSocket,
      tableItems,
    },
    { timeout: 15000, maxBodyLength: Infinity }
  );
  console.log(`[HALL FORWARD] ${nameServiceSocket} tables=${tableItems.length} stamp=${stamp} fresh=${fresh ? 1 : 0}`);
  return true;
"""
new = """  const stamp = maxTableRoadStamp(tableItems);
  const fresh = stamp > maxRoadStamp;
  if (fresh) {
    maxRoadStamp = stamp;
    lastHallFreshAt = Date.now();
  } else {
    console.log(`[HALL SKIP] ${nameServiceSocket} stamp=${stamp} (chua van moi)`);
    return true;
  }
  const serverPort = process.env.SERVER_PORT || 3201;
  try {
    await axios.post(
      `http://localhost:${serverPort}/api/ingest-hall-data`,
      {
        nameService: nameServiceSocket,
        tableItems,
      },
      { timeout: 4000, maxBodyLength: Infinity }
    );
  } catch (e) {
    console.log(`[HALL INGEST SLOW] ${nameServiceSocket} ${e.message}`);
  }
  console.log(`[HALL FORWARD] ${nameServiceSocket} tables=${tableItems.length} stamp=${stamp} fresh=1`);
  return true;
"""
if old not in st:
    raise SystemExit("session ingest block missing")
st = st.replace(old, new, 1)

st = st.replace(
    "    pollLobbyHall().catch((e) => console.error(\"[HALL POLL]\", e.message));\n  }, 2000);",
    "    pollLobbyHall().catch((e) => console.error(\"[HALL POLL]\", e.message));\n  }, 1000);",
    1,
)
st = st.replace(
    '  console.log(`[HALL POLL] ${nameServiceSocket} poll sảnh mỗi 2s — chỉ reset khi poll chết`);',
    '  console.log(`[HALL POLL] ${nameServiceSocket} poll sảnh mỗi 1s — chỉ reset khi poll chết`);',
    1,
)
SESS.write_text(st, encoding="utf-8")
print("SESSION_OK")

sv = SRV.read_text(encoding="utf-8")
old_q = """let hallUpdateQueue = Promise.resolve();
function enqueueHallUpdate(dataTableList) {
  const task = hallUpdateQueue.then(async () => {
    await initDatabase(dataTableList);
    await checkAndUpdateDatabase(dataTableList, io);
  });
  hallUpdateQueue = task.catch((error) => {
    console.error(`[HALL UPDATE ERROR] ${error.message}`);
  });
  return task;
}
"""
new_q = """let hallUpdateQueue = Promise.resolve();
let latestHallPayload = null;
let lastBrowserIngestAt = 0;
function enqueueHallUpdate(dataTableList) {
  latestHallPayload = dataTableList;
  const task = hallUpdateQueue.then(async () => {
    while (latestHallPayload) {
      const data = latestHallPayload;
      latestHallPayload = null;
      await initDatabase(data);
      await checkAndUpdateDatabase(data, io);
    }
  });
  hallUpdateQueue = task.catch((error) => {
    console.error(`[HALL UPDATE ERROR] ${error.message}`);
  });
  return task;
}
"""
if old_q not in sv:
    raise SystemExit("enqueue block missing")
sv = sv.replace(old_q, new_q, 1)

old_r = """    const dataTableList = filterData(tableItems);
    await enqueueHallUpdate(dataTableList);
    if (SERVER_VERBOSE_LOG) {
      console.log(`[HALL INGEST] ${nameServiceSocket} tables=${dataTableList.length}`);
    }
    return res.json({ success: true, tables: dataTableList.length });
"""
# nameService variable is nameService not nameServiceSocket in server
old_r = """    const dataTableList = filterData(tableItems);
    await enqueueHallUpdate(dataTableList);
    if (SERVER_VERBOSE_LOG) {
      console.log(`[HALL INGEST] ${nameService} tables=${dataTableList.length}`);
    }
    return res.json({ success: true, tables: dataTableList.length });
"""
new_r = """    const dataTableList = filterData(tableItems);
    lastBrowserIngestAt = Date.now();
    enqueueHallUpdate(dataTableList);
    return res.json({ success: true, tables: dataTableList.length, queued: true });
"""
if old_r not in sv:
    raise SystemExit("ingest route block missing")
sv = sv.replace(old_r, new_r, 1)

old_poll = """  const shuffledSessions = [...availableSessions].sort(() => Math.random() - 0.5);
  for (const selectedSession of shuffledSessions) {
"""
new_poll = """  if (Date.now() - lastBrowserIngestAt < 8000) return;
  const shuffledSessions = [...availableSessions].sort(() => Math.random() - 0.5);
  for (const selectedSession of shuffledSessions) {
"""
if old_poll not in sv:
    raise SystemExit("server poll block missing")
sv = sv.replace(old_poll, new_poll, 1)

SRV.write_text(sv, encoding="utf-8")
print("SERVER_OK")
