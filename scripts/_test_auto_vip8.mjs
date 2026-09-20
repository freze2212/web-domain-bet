/**
 * Test auto tạo lp-gg88-vip-8 (Git-connected, cùng repo lp-gg88-vip)
 */
import {
  createNextGitPagesInstance,
  getAvailablePagesProject,
  getPagesProjectDomainsCount,
} from "../src/cloudflare.js";
import { config } from "../src/config.js";

const ROOT = "lp-gg88-vip";
const TARGET = "lp-gg88-vip-8";
const ACC = config.cloudflare.accountId();
const TOK = config.cloudflare.token();

async function projectExists(name) {
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${encodeURIComponent(name)}`,
      { headers: { Authorization: `Bearer ${TOK}` } }
    );
    const j = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}

console.log("=== Test auto VIP-8 ===");

let created;
if (await projectExists(TARGET)) {
  console.log(TARGET, "đã tồn tại — bỏ qua createNext");
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${encodeURIComponent(TARGET)}`,
    { headers: { Authorization: `Bearer ${TOK}` } }
  );
  const j = await r.json();
  created = {
    ...j.result,
    name: TARGET,
    canonicalSubdomain: `${TARGET}.pages.dev`,
    domainsCount: await getPagesProjectDomainsCount(ACC, TARGET),
  };
} else {
  created = await createNextGitPagesInstance(ROOT);
}

console.log("instance:", {
  name: created.name,
  subdomain: created.canonicalSubdomain,
  source: created.source?.type,
  repo: created.source?.config
    ? `${created.source.config.owner}/${created.source.config.repo_name}@${created.source.config.production_branch}`
    : null,
  domainsCount: created.domainsCount,
});

const picked = await getAvailablePagesProject("lp-gg88-vip-2");
console.log("getAvailablePagesProject (ưu tiên vip-2 nếu còn chỗ):", {
  name: picked.name,
  domainsCount: picked.domainsCount,
  canonicalSubdomain: picked.canonicalSubdomain,
});

const probeName = created.canonicalSubdomain || `${TARGET}.pages.dev`;
try {
  const url = `https://${probeName}/`;
  const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  console.log("live probe", url, r.status, (t.match(/<title>([^<]+)/i) || [])[1] || t.slice(0, 80));
} catch (e) {
  console.log("live probe err", e.message);
}

console.log("=== Done ===");
