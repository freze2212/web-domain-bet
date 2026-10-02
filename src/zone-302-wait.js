import { findZoneByName, getOrCreateZone, getZoneNameservers, setupDirect302Redirect } from "./cloudflare.js";
import { updateNameservers } from "./spaceship.js";
import { getHistory, setHistoryProgress, updateHistoryItem } from "./history.js";
import { completeTask, failTask, getTask } from "./task-queue.js";
import { syncDeployOwnership } from "./ownership.js";
import { markDomainOrderFulfilled, refundFailedDomainOrder } from "./domain-orders.js";

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
    for (const h of waiting) {
      const born = new Date(h.timestamp || 0).getTime();
      if (born && now - born > ZONE_302_WAIT_MS) {
        let error = `Zone Cloudflare của [${h.domain}] vẫn pending sau 6 giờ. Nameserver đã trỏ — kiểm tra registry rồi thử lại.`;
        try {
          const refund = refundFailedDomainOrder(h.details?.orderId, h.domain, error);
          if (refund.refunded) {
            error += ` Đã hoàn ${refund.amount} Xu vào ví và gỡ miền khỏi tài khoản. Admin duyệt lại để cài tiếp.`;
          }
        } catch (refundErr) {
          console.error(`[302-wait] hoàn Xu ${h.domain}:`, refundErr.message);
        }
        updateHistoryItem(h.id, { status: "failed", progress: null, error, details: { waitZone302: false } });
        if (h.taskId && getTask(h.taskId)) failTask(h.taskId, new Error(error), "Hết thời gian chờ zone");
        continue;
      }
      const zone = await findZoneByName(h.domain).catch(() => null);
      if (zone?.status !== "active") {
        const step = `Đã trỏ NS. Zone Cloudflare đang "${zone?.status || "pending"}" — tự tạo 302 khi active.`;
        if (h.progress !== step) setHistoryProgress(h.id, step, { waitZone302: true, link: h.link });
        continue;
      }
      try {
        const cf = await setupDirect302Redirect(h.domain, h.link);
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
