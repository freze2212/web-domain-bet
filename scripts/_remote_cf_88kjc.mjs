import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "..");
process.chdir(root);

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { findZoneByName, cfRequest, tokenForZone, cfRequestFull } = await import("../src/cloudflare.js");
const D = "88kjc.dev";
const acc = process.env.CLOUDFLARE_ACCOUNT_ID;

const z = await findZoneByName(D);
console.log("ZONE", z ? { id: z.id, status: z.status, acc: z.account?.name } : null);

if (z) {
  const tok = tokenForZone(z);
  const recs = await cfRequest(`/zones/${z.id}/dns_records`, { token: tok });
  console.log(
    "DNS",
    JSON.stringify(
      recs
        .filter((r) => r.name.includes("88kjc"))
        .map((r) => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied })),
      null,
      2
    )
  );
  try {
    const pr = await cfRequest(`/zones/${z.id}/pagerules`, { token: tok });
    console.log(
      "PAGERULES",
      JSON.stringify(
        pr.map((r) => ({
          status: r.status,
          target: r.targets?.[0]?.constraint?.value,
          action: r.actions?.[0],
        })),
        null,
        2
      )
    );
  } catch (e) {
    console.log("PR_ERR", e.message);
  }
}

for (const proj of ["lp-gg88-vip-2", "lp-gg88-vip-2-1", "lp-gg88-vip-2-2", "gg88-lp-5uae", "gg88-lp-5uae-1", "gg88-lp-5uae-2", "ladpage-5f-nhannhan", "lp-gg88-mx-git2"]) {
  for (const n of [D, `www.${D}`]) {
    try {
      const r = await cfRequestFull(
        `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains/${encodeURIComponent(n)}`
      );
      console.log("PAGES", proj, n, JSON.stringify(r.result));
    } catch (e) {
      if (!/404|not found|10007/i.test(e.message)) console.log("PAGES_ERR", proj, n, e.message);
    }
  }
}

import { findDomainInRepos } from "../src/repo-scanner.js";
import { listTemplates } from "../src/templates.js";
const matches = findDomainInRepos(D);
console.log(
  "REPO_MATCHES",
  JSON.stringify(
    matches.map((m) => ({ file: m.filePath, folder: m.folderPath, link: m.link })),
    null,
    2
  )
);
const tpls = listTemplates().filter((t) => {
  const dj = t.path ? path.join(t.path, "domains.json") : "";
  if (!dj || !fs.existsSync(dj)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(dj, "utf8"));
    return D in j;
  } catch {
    return false;
  }
});
console.log(
  "TEMPLATES_WITH_DOMAIN",
  tpls.map((t) => ({ id: t.id, name: t.name, pages: t.pagesProject, cname: t.cnameTarget }))
);

// Live fetch pages + apex
for (const host of ["gg88-lp-5uae.pages.dev", D]) {
  try {
    const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15000),
    });
    const t = await r.text();
    let entry = null;
    try {
      const j = JSON.parse(t);
      entry = j[D];
    } catch {}
    console.log("LIVE", host, "status", r.status, "entry", JSON.stringify(entry));
  } catch (e) {
    console.log("LIVE_ERR", host, e.message);
  }
}
