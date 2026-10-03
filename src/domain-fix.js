import {
  getOrCreateZone,
  getZoneNameservers,
  tokenForZone,
  ensurePagesCname,
  deleteForwardingPageRules,
  findActiveForwardingRule,
  setupDirect302Redirect,
  waitForPagesDomainActive,
  pagesTokenForAccount,
} from "./cloudflare.js";
import { updateNameservers, getDomainInfo } from "./spaceship.js";
import { getTemplate } from "./templates.js";
import { findServingTemplate, findServingRepoMatch } from "./repo-scanner.js";
import { probeLiveRedirect, readApexCnameProject, getProjectSubdomain } from "./pages-domain-map.js";
import { getLastDomainHistoryMeta } from "./history.js";
import { switchDomainToTemplate } from "./lp-switch.js";
import { isSelfRedirect } from "./link-resolve.js";

const stripPagesDev = (s) => String(s || "").trim().toLowerCase().replace(/\.pages\.dev$/, "");

function entryLink(config) {
  if (!config) return "";
  if (typeof config === "string") return config;
  for (const k of ["main_url", "url", "link", "register_url"]) {
    if (typeof config[k] === "string" && config[k]) return config[k];
  }
  return "";
}

/**
 * Sửa miền mà không đổi mẫu/link nó đang chạy:
 * - đang 302 thật → giữ nguyên
 * - đang gắn Pages → trỏ lại CNAME về đúng project đó, giữ link trong mẫu đó
 * - không chạy gì → dựng lại theo lần thao tác thành công gần nhất (mẫu + link), qua luồng đổi mẫu an toàn
 * Không đoán mẫu, không tự điền link.
 */
export async function fixDomain(domain, { historyItem = null, log = () => {} } = {}) {
  const zone = await getOrCreateZone(domain);
  const ns = getZoneNameservers(zone);
  if (ns?.length) {
    const sp = await getDomainInfo(domain).catch(() => null);
    const hosts = (sp?.nameservers?.hosts || []).map((x) => x.toLowerCase());
    if (!ns.every((h) => hosts.includes(h.toLowerCase()))) {
      log(`Đồng bộ nameserver Spaceship → ${ns.join(", ")}`);
      await updateNameservers(domain, ns).catch(() => {});
    } else {
      log("Nameserver đã đúng");
    }
  }

  const live302 = await probeLiveRedirect(domain);
  if (live302?.location) {
    log(`Miền đang chuyển hướng 302 tới ${live302.location} — giữ nguyên`);
    return { mode: "302", link: live302.location, changed: false };
  }

  const cname = await readApexCnameProject(domain).catch(() => null);
  const rule = zone?.id ? await findActiveForwardingRule(zone.id, { token: tokenForZone(zone) }).catch(() => null) : null;
  if (rule?.targetUrl && !cname && !isSelfRedirect(domain, rule.targetUrl)) {
    log(`Page Rule 302 đang bật tới ${rule.targetUrl} nhưng miền chưa chuyển hướng — dựng lại 302 với đúng link đó`);
    await setupDirect302Redirect(domain, rule.targetUrl);
    return { mode: "302", link: rule.targetUrl, changed: true };
  }

  const serving = findServingTemplate(domain);
  if (serving) {
    const link = entryLink(findServingRepoMatch(domain)?.config);
    if (!link) {
      throw new Error(`Miền đang gắn mẫu [${serving.template.name}] nhưng chưa có link riêng. Dùng "Đổi link" để nhập link.`);
    }
    const sub = getProjectSubdomain(serving.project);
    let changed = false;
    if (cname !== stripPagesDev(sub)) {
      log(`CNAME đang trỏ ${cname || "(không có)"} — trỏ lại về ${sub}`);
      await ensurePagesCname(domain, sub);
      if (zone?.id) await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});
      changed = true;
    } else {
      log(`CNAME đã trỏ đúng ${sub}`);
    }
    await waitForPagesDomainActive(serving.project, domain, serving.accountId, 60_000, pagesTokenForAccount(serving.accountId))
      .then(() => log("Pages đã active"))
      .catch((e) => log(`⚠️ ${e.message}`));
    return { mode: "LP", template: serving.template, link, changed };
  }

  const last = historyItem?.link ? historyItem : getLastDomainHistoryMeta(domain);
  const is302 = String(last?.actionType || "").includes("302") || last?.templateId === "302_DIRECT";
  if (last?.link && is302) {
    log(`Miền không chạy gì — dựng lại 302 theo lần thành công gần nhất (${last.link})`);
    await setupDirect302Redirect(domain, last.link);
    return { mode: "302", link: last.link, changed: true };
  }
  const tpl = last?.templateId ? getTemplate(last.templateId) : null;
  if (last?.link && tpl) {
    log(`Miền không chạy gì — dựng lại mẫu [${tpl.name}] với link ${last.link} (lần thành công gần nhất)`);
    const r = await switchDomainToTemplate({ domain, template: tpl, link: last.link, tele: last.tele || "", onProgress: log });
    return { mode: "LP", template: tpl, link: last.link, changed: true, finalTarget: r.finalTarget };
  }

  throw new Error("Không xác định được miền đang chạy mẫu nào hay link nào. Dùng \"Đổi mẫu\" hoặc \"Chuyển 302\" để chọn.");
}
