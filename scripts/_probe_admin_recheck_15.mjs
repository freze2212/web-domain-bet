/**
 * Re-check 15 "same class" Admin domains — READ ONLY, no fixes.
 * Verify whether live still redirects / has working link despite domains.json probe flags.
 */
import fs from "fs";

const DOMAINS = [
  "gametong.net",
  "gg86.us",
  "gg881.us",
  "gg88bet.cc",
  "gg88ov.com",
  "gg88us.net",
  "88live.uk",
  "gg88dk.net",
  "ggtong.net",
  "llwin09.net",
  "maanvip.com",
  "mm88sin.top",
  "mm88us.net",
  "xinchao2026.com",
  "xoamaan.asia",
];

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: opts.redirect || "manual",
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...(opts.headers || {}),
    },
  });
  const t = await r.text().catch(() => "");
  return { status: r.status, headers: r.headers, text: t, url: r.url };
}

async function check(domain) {
  const out = { domain };

  // 1) domains.json
  try {
    const dj = await fetchText(`https://${domain}/domains.json?t=${Date.now()}`, { redirect: "follow" });
    out.dj = { http: dj.status, bytes: dj.text.length };
    if (dj.text.trim().startsWith("<")) {
      out.dj.kind = "html";
    } else {
      try {
        const j = JSON.parse(dj.text);
        const keys = Object.keys(j);
        const self = j[domain] || j[`www.${domain}`];
        out.dj.keys = keys.length;
        out.dj.hasSelf = !!self;
        out.dj.selfLink = linkOf(self) || null;
        out.dj.sample = keys.slice(0, 5);
      } catch {
        out.dj.kind = "bad_json";
      }
    }
  } catch (e) {
    out.dj = { error: e.message };
  }

  // 2) homepage — no follow: see 302 Location
  try {
    const home = await fetchText(`https://${domain}/`, { redirect: "manual" });
    out.home = {
      http: home.status,
      location: home.headers.get("location"),
      cfRay: home.headers.get("cf-ray"),
      contentType: home.headers.get("content-type"),
      len: home.text.length,
    };
    const m = home.text.match(/REDIRECT_URL\s*=\s*["']([^"']+)["']/);
    const m2 = home.text.match(/main_url["']?\s*:\s*["']([^"']+)["']/);
    const m3 = home.text.match(/href=["'](https?:\/\/[^"']+)["'][^>]*class=["'][^"']*(?:redirect|btn-register|cta)/i);
    out.home.inlineRedirect = m?.[1] || m2?.[1] || null;
    out.home.ctaSample = m3?.[1] || null;
    // title
    out.home.title = (home.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || null;
  } catch (e) {
    out.home = { error: e.message };
  }

  // 3) follow redirects once chain
  try {
    const followed = await fetch(`https://${domain}/`, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache" },
    });
    out.follow = {
      finalUrl: followed.url,
      http: followed.status,
      redirectedAway: !String(followed.url).includes(domain),
    };
  } catch (e) {
    out.follow = { error: e.message };
  }

  // Verdict from user POV: "có link hoạt động"
  const loc = out.home?.location || "";
  const inline = out.home?.inlineRedirect || "";
  const selfLink = out.dj?.selfLink || "";
  const followedAway = !!out.follow?.redirectedAway;
  const workingLink = selfLink || loc || inline || (followedAway ? out.follow.finalUrl : "");
  out.userFacing = {
    hasWorkingLink: !!(selfLink || (loc && loc.startsWith("http")) || inline || followedAway),
    via: selfLink
      ? "domains.json"
      : loc && loc.startsWith("http")
        ? "http_302"
        : inline
          ? "inline_js"
          : followedAway
            ? "follow_redirect"
            : "none",
    link: workingLink || null,
    domainsJsonIssue: out.dj?.hasSelf === false || out.dj?.keys === 0 || out.dj?.kind === "html",
  };

  return out;
}

const results = [];
for (const d of DOMAINS) {
  process.stdout.write(`check ${d}...\n`);
  results.push(await check(d));
}

const summary = {
  at: new Date().toISOString(),
  note: "READ ONLY — no fixes. Re-verify 15 domains previously flagged.",
  totals: {
    checked: results.length,
    userFacingOk: results.filter((r) => r.userFacing.hasWorkingLink).length,
    userFacingNoLink: results.filter((r) => !r.userFacing.hasWorkingLink).length,
    stillMissingJsonKey: results.filter((r) => r.dj?.hasSelf === false).length,
    emptyJson: results.filter((r) => r.dj?.keys === 0).length,
  },
  results,
};

fs.writeFileSync("data/_PROBE_ADMIN_RECHECK_15.json", JSON.stringify(summary, null, 2));

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary.totals, null, 2));
console.log("\nPer domain:");
for (const r of results) {
  console.log(
    `${r.domain.padEnd(18)} userLink=${r.userFacing.hasWorkingLink ? "YES" : "NO "} via=${String(r.userFacing.via).padEnd(16)} link=${r.userFacing.link || "-"} | dj.hasSelf=${r.dj?.hasSelf} keys=${r.dj?.keys} home=${r.home?.http} loc=${r.home?.location || "-"}`
  );
}
