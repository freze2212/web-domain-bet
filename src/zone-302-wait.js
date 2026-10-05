import { findZoneByName, getOrCreateZone, getZoneNameservers, setupDirect302Redirect } from "./cloudflare.js";
import { getDomainInfo, updateNameservers } from "./spaceship.js";
import { getHistory, setHistoryProgress, updateHistoryItem } from "./history.js";
import { completeTask, failTask, getTask, listActiveTasks, markTaskWaitingZone, updateTaskProgress } from "./task-queue.js";
import { syncDeployOwnership } from "./ownership.js";
import { markDomainOrderFulfilled } from "./domain-orders.js";

export const ZONE_302_WAIT_MS = 6 * 60 * 60 * 1000;
const INLINE_WAIT_MS = 3 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Trỏ NS Cloudflare trước. Chờ zone active tối đa waitMs. */
export async function pointNameserversFor302(domain, { waitMs = INLINE_WAIT_MS, onTick } = {}) {
  const created = await getOrCreateZone(domain);
  const nameservers = getZoneNameservers(created);
  if (nameservers?.length) {
    await updateNameservers(domain, nameservers).catch(() => {});
  }
  let zone = created;
  const started = Date.now();
  while (zone?.status !== "active" && Date.now() - started < waitMs) {
    if (onTick) onTick(zone?.status || "pending", nameservers);
    await sleep(10000);
    zone = (await findZoneByName(domain).catch(() => null)) || zone;
  }
  return { active: zone?.status === "active", zone, nameservers };
}

/**
 * Gọi lúc khởi động, TRƯỚC khi đóng job treo: job 302 bị restart cắt ngang mà miền đã thuộc mình
 * → chuyển sang chế độ chờ zone để resumePendingZoneRedirects tự làm nốt (trỏ NS + Page Rule).
 * Job mua chưa xong (Spaceship chưa có miền) giữ nguyên để bị đóng thất bại như cũ.
 */
export async function adoptInterrupted302Jobs() {
  const jobs = listActiveTasks().filter(
    (t) => t.type === "DEPLOY_302" && !t.params?.waitZone302 && t.params?.domain && t.params?.link
  );
  let adopted = 0;
  for (const t of jobs) {
    const { domain, link, historyId, isBuy, orderId = null } = t.params;
    if (isBuy) {
      const owned = await Promise.race([
        getDomainInfo(domain).catch(() => null),
        sleep(15000).then(() => null),
      ]);
      if (owned?.lifecycleStatus !== "registered") continue;
    }
    const msg = "Hub vừa khởi động lại — miền đã thuộc mình, tự chạy tiếp bước trỏ NS + 302...";
    markTaskWaitingZone(t.id);
    updateTaskProgress(t.id, 65, msg, msg, "info");
    if (historyId) {
      updateHistoryItem(historyId, {
        status: "in_progress",
        progress: msg,
        error: null,
        link,
        details: { step: msg, waitZone302: true, link, orderId, resumedAfterRestart: true, nsEnsured: false },
      });
    }
    adopted++;
  }
  return adopted;
}

let resumeRunning = false;

/** Job 302 còn pending: khi zone active thì tự tạo Page Rule. */
export async function resumePendingZoneRedirects() {
  if (resumeRunning) return;
  resumeRunning = true;
  try {
    const now = Date.now();
    const waiting = getHistory().filter(
      (h) =>
        (h.status === "in_progress" || h.status === "pending") &&
        h.details?.waitZone302 &&
        h.domain &&
        h.link
    );
    // Cũ trước, mới sau: cùng miền có nhiều job chờ thì link mới nhất thắng
    for (const h of waiting.reverse()) {
      const born = new Date(h.timestamp || 0).getTime();
      if (born && now - born > ZONE_302_WAIT_MS) {
        // Miền đã mua xong trước khi chờ zone → không hoàn Xu, đơn giữ "đã duyệt" để Thử lại cài tiếp
        const error = `Zone Cloudflare của [${h.domain}] vẫn pending sau 6 giờ. Nameserver đã trỏ — kiểm tra registry rồi bấm Thử lại (không mua lại).`;
        updateHistoryItem(h.id, { status: "failed", progress: null, error, details: { waitZone302: false } });
        if (h.taskId && getTask(h.taskId)) failTask(h.taskId, new Error(error), "Hết thời gian chờ zone");
        continue;
      }
      let zone = await findZoneByName(h.domain).catch(() => null);
      if (!zone || (h.details?.resumedAfterRestart && !h.details?.nsEnsured)) {
        try {
          zone = (await pointNameserversFor302(h.domain, { waitMs: 0 })).zone || zone;
          updateHistoryItem(h.id, { details: { nsEnsured: true } });
        } catch (nsErr) {
          console.error(`[302-wait] trỏ NS ${h.domain}:`, nsErr.message);
          continue;
        }
      }
      if (zone?.status !== "active") {
        const step = `Đã trỏ NS. Zone Cloudflare đang "${zone?.status || "pending"}" — tự tạo 302 khi active.`;
        if (h.progress !== step) setHistoryProgress(h.id, step, { waitZone302: true, link: h.link });
        continue;
      }
      try {
        const cf = await setupDirect302Redirect(h.domain, h.link);
        const { findDomainInRepos, removeDomainFromRepo } = await import("./repo-scanner.js");
        for (const m of findDomainInRepos(h.domain)) {
          await removeDomainFromRepo(h.domain, m.filePath || m.folderPath).catch(() => {});
        }
        syncDeployOwnership(
          h.domain,
          { userId: h.userId || "u_admin", username: h.username, fullName: h.fullName, role: "admin" },
          {},
          { mode: "302", currentLink: h.link, templateId: null }
        );
        updateHistoryItem(h.id, {
          status: "success",
          progress: null,
          error: null,
          link: h.link,
          details: { waitZone302: false, cfAccountType: cf?.cfAccountType || null },
        });
        if (h.taskId && getTask(h.taskId)) {
          completeTask(h.taskId, { domain: h.domain, link: h.link }, `Đã cài 302 cho ${h.domain}`);
        }
        try {
          if (h.details?.orderId) {
            markDomainOrderFulfilled(h.details.orderId, { username: h.username || "admin" }, { deployMode: "302" });
          }
        } catch (fulfillErr) {
          console.error(`[302-wait] fulfill ${h.domain}:`, fulfillErr.message);
        }
        console.log(`[302-wait] ${h.domain} zone active → 302 ${h.link}`);
      } catch (err) {
        console.error(`[302-wait] ${h.domain}:`, err.message);
      }
    }
  } finally {
    resumeRunning = false;
  }
}
