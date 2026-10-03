import { findZoneByName, findActiveForwardingRule, tokenForZone } from "./cloudflare.js";
import { normalizeUrl, isRealLink } from "./utils.js";

function pickConfigLink(config) {
  if (!config) return { link: null, tele: null };
  // String.prototype.link là hàm native: entry dạng chuỗi phải xử lý riêng
  if (typeof config === "string") return { link: config, tele: "" };
  const str = (v) => (typeof v === "string" && v ? v : null);
  const link = str(config.main_url) || str(config.url) || str(config.link) || str(config.register_url) || null;
  const teleRaw = config.telegram_url || config.tele || null;
  const messenger = config.messenger_url || null;
  const tele =
    teleRaw ||
    (messenger && link && messenger !== link ? messenger : "") ||
    "";
  return { link, tele: tele || "" };
}

/**
 * Link đang chạy thật khi form để trống:
 * provided → 302 live (mở thử miền) → domains.json của mẫu đang phục vụ → Page Rule đang bật.
 * Không lấy history/ownership/Page Rule đã tắt: đó là link cũ, không phải link đang chạy.
 */
export async function resolveInheritedLink(domain, opts = {}) {
  const provided = (opts.providedLink || "").trim();
  const providedTele = (opts.providedTele || "").trim();

  if (provided) {
    let norm = null;
    try {
      norm = normalizeUrl(provided);
    } catch {}
    if (norm && isRealLink(norm)) return { link: norm, tele: providedTele, source: "provided" };
  }

  const { probeLiveRedirect } = await import("./pages-domain-map.js");
  const live302 = await probeLiveRedirect(domain);
  if (live302?.location) {
    try {
      return { link: normalizeUrl(live302.location), tele: providedTele, source: "live_302" };
    } catch {}
  }

  const { findServingRepoMatch } = await import("./repo-scanner.js");
  const match = findServingRepoMatch(domain);
  if (match) {
    const picked = pickConfigLink(match.config);
    if (picked.link && isRealLink(picked.link)) {
      try {
        return {
          link: normalizeUrl(picked.link),
          tele: providedTele || picked.tele,
          source: "domains_json",
        };
      } catch {}
    }
  }

  const zone = await findZoneByName(domain).catch(() => null);
  if (zone) {
    const zOpts = { token: tokenForZone(zone) };
    const active = await findActiveForwardingRule(zone.id, zOpts).catch(() => null);
    if (active?.targetUrl) {
      return {
        link: normalizeUrl(active.targetUrl),
        tele: providedTele,
        source: "page_rule_active",
      };
    }
  }

  return { link: null, tele: providedTele || "", source: "none" };
}

export const NO_LINK_ERROR =
  "Miền chưa có link đang chạy (không chuyển hướng, không có dòng trong mẫu đang phục vụ). Vui lòng nhập link.";
