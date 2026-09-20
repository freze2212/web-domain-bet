import { findZoneByName, findActiveForwardingRule, findAnyForwardingRule, tokenForZone } from "./cloudflare.js";
import { getLastDomainHistoryMeta } from "./history.js";
import { getDomainOwner } from "./ownership.js";
import { normalizeUrl } from "./utils.js";

function pickConfigLink(config) {
  if (!config) return { link: null, tele: null };
  const link = config.main_url || config.url || config.link || config.register_url || null;
  const teleRaw = config.telegram_url || config.tele || null;
  const messenger = config.messenger_url || null;
  const tele =
    teleRaw ||
    (messenger && link && messenger !== link ? messenger : "") ||
    "";
  return { link, tele: tele || "" };
}

/**
 * Chuỗi kế thừa link giống thao tác tay khi form để trống:
 * provided → domains.json → Page Rule (active rồi disabled) → ownership → history → live 302 Location
 */
export async function resolveInheritedLink(domain, opts = {}) {
  const provided = (opts.providedLink || "").trim();
  const providedTele = (opts.providedTele || "").trim();

  // Tránh coi placeholder form "https://" là link thật
  if (provided && provided !== "https://" && provided !== "http://") {
    try {
      return {
        link: normalizeUrl(provided),
        tele: providedTele,
        source: "provided",
      };
    } catch {
      // fall through to inherit
    }
  }

  const { findDomainInRepos } = await import("./repo-scanner.js");
  const matches = findDomainInRepos(domain);
  if (matches.length > 0) {
    const picked = pickConfigLink(matches[0].config);
    if (picked.link) {
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
    const anyRule = await findAnyForwardingRule(zone.id, zOpts).catch(() => null);
    if (anyRule?.targetUrl) {
      return {
        link: normalizeUrl(anyRule.targetUrl),
        tele: providedTele,
        source: "page_rule_any",
      };
    }
  }

  const owner = getDomainOwner(domain);
  if (owner?.currentLink) {
    try {
      return {
        link: normalizeUrl(owner.currentLink),
        tele: providedTele || owner.tele || "",
        source: "ownership",
      };
    } catch {}
  }

  const hist = getLastDomainHistoryMeta(domain);
  if (hist?.link) {
    try {
      return {
        link: normalizeUrl(hist.link),
        tele: providedTele || hist.tele || "",
        source: "history",
      };
    } catch {}
  }

  try {
    const r = await fetch(`https://${domain}/`, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "LandingHub-LinkInherit/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const loc = r.headers.get("location");
    if (loc && [301, 302, 303, 307, 308].includes(r.status)) {
      return {
        link: normalizeUrl(loc),
        tele: providedTele,
        source: "live_302",
      };
    }
  } catch {}

  return { link: null, tele: providedTele || "", source: "none" };
}
