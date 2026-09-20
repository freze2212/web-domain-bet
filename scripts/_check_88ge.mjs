const d = "88ge.top";
const expected = "https://gg8843.com/?id=611868495";

function pick(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

const djRes = await fetch(`https://${d}/domains.json?t=${Date.now()}`, {
  headers: { "cache-control": "no-cache" },
  signal: AbortSignal.timeout(15000),
});
const djText = await djRes.text();
let live = null;
let keys = 0;
if (!djText.trim().startsWith("<")) {
  const j = JSON.parse(djText);
  keys = Object.keys(j).length;
  live = pick(j[d] || j[`www.${d}`]);
}

console.log(
  JSON.stringify(
    {
      domain: d,
      liveLink: live,
      expected,
      sameAsExpected: String(live || "").replace(/\/$/, "") === expected,
      hubSaid: "https://www.gg8826.com/?id=518634657",
      domainsJsonKeys: keys,
    },
    null,
    2
  )
);
