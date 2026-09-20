import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const TOK = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;

async function cf(p) {
  const r = await fetch("https://api.cloudflare.com/client/v4" + p, {
    headers: { Authorization: `Bearer ${TOK}` },
  });
  return r.json();
}
function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}
async function probe(host) {
  try {
    const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache" },
    });
    const j = r.ok ? await r.json() : null;
    const apex = host.replace(/^www\./, "");
    return {
      host,
      http: r.status,
      link: linkOf(j && (j[host] || j[apex] || j[`www.${apex}`])),
      n: j ? Object.keys(j).length : 0,
      xxKeys: j ? Object.keys(j).filter((k) => /xx88|xx88pro/i.test(k)) : [],
    };
  } catch (e) {
    return { host, err: e.message };
  }
}

const meta = await cf("/accounts/" + AID + "/pages/projects/lp-7f-xx88-games");
console.log("direct source", meta.result?.source?.type || "none/direct");
const doms = await cf("/accounts/" + AID + "/pages/projects/lp-7f-xx88-games/domains");
console.log(
  "direct domains",
  (doms.result || []).map((x) => x.name + ":" + x.status)
);
const g2 = await cf("/accounts/" + AID + "/pages/projects/lp-7f-xx88-games-git2");
console.log("git2 exists", g2.success, g2.result?.source?.type);

console.log("probe apex", await probe("xx88pro.us"));
console.log("probe www", await probe("www.xx88pro.us"));

try {
  const r = await fetch(`https://lp-7f-xx88-games.pages.dev/domains.json?v=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
  });
  const j = r.ok ? await r.json() : null;
  console.log("pagesdev Direct", r.status, {
    n: j ? Object.keys(j).length : 0,
    "xx88pro.us": linkOf(j?.["xx88pro.us"]),
    "www.xx88pro.us": linkOf(j?.["www.xx88pro.us"]),
  });
} catch (e) {
  console.log("pagesdev Direct", e.message);
}

for (const path of ["domains.json", "public/domains.json"]) {
  const gh = await fetch(`https://api.github.com/repos/freze2212/lp-7f-xx88-games/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hub",
    },
  });
  const gj = await gh.json();
  if (gj.content) {
    const j = JSON.parse(Buffer.from(gj.content, "base64").toString("utf8"));
    console.log("github", path, {
      n: Object.keys(j).length,
      "xx88pro.us": linkOf(j["xx88pro.us"]),
      "www.xx88pro.us": linkOf(j["www.xx88pro.us"]),
    });
  } else {
    console.log("github", path, gj.message || "missing");
  }
}

const repo = await fetch("https://api.github.com/repos/freze2212/lp-7f-xx88-games", {
  headers: {
    Authorization: `Bearer ${GH}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "hub",
  },
});
const rj = await repo.json();
console.log("repo", repo.status, rj.default_branch, rj.full_name);
