import { Client } from "ssh2";

const domains = [
  "gg88h.uk",
  "gg88k.uk",
  "gg88top.win",
  "gg88d.net",
  "gg88t.net",
  "gg88h.us",
  "gg88t.us",
];

const expected = {
  "gg88h.uk": "https://www.gg8832.com/?id=894528974",
  "gg88k.uk": "https://www.gg8832.com/?id=851471280",
  "gg88top.win": "https://gg8817.com/?id=140366098",
  "gg88d.net": "https://gg8826.com/?id=769240761",
  "gg88t.net": "https://www.gg8824.com/?id=114851179",
  "gg88h.us": "https://www.gg8826.com/home/register?id=170291680",
  "gg88t.us": "https://gg8817.com/home/register?id=720657617",
};

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh

node --input-type=module <<'NODE'
import fs from "fs";
import { findDomainInRepos } from "./src/repo-scanner.js";
import { getDomainOwner } from "./src/ownership.js";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";

const domains = ${JSON.stringify(domains)};
const expected = ${JSON.stringify(expected)};

function normLink(u) {
  try {
    const x = new URL(String(u || "").trim());
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/") && x.pathname === "/") s = s.slice(0, -1);
    return s;
  } catch { return String(u || "").trim(); }
}

async function probeLive(domain) {
  const urls = [\`https://\${domain}/\`, \`https://www.\${domain}/\`];
  const out = { http: null, location: null, domainsJson: null, mode: null, err: null };
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(18000) });
      out.http = r.status;
      const loc = r.headers.get("location");
      if (loc) {
        out.location = loc;
        out.mode = "302";
        return out;
      }
      // LP: try domains.json
      try {
        const dj = await fetch(\`https://\${domain}/domains.json\`, { signal: AbortSignal.timeout(12000) });
        if (dj.ok) {
          const j = await dj.json();
          const e = j[domain] || j[\`www.\${domain}\`] || null;
          out.domainsJson = e;
          out.mode = "LP";
          out.liveLink = e?.main_url || e?.messenger_url || e?.telegram_url || null;
          return out;
        }
      } catch {}
      // HTML sniff id=
      try {
        const html = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).text();
        const m = html.match(/https?:\\/\\/[^"'\\s<>]+id=\\d+/i);
        if (m) { out.liveLink = m[0]; out.mode = "LP_HTML"; return out; }
      } catch {}
      return out;
    } catch (e) {
      out.err = e.message;
    }
  }
  return out;
}

async function hubLink(domain) {
  const owner = getDomainOwner(domain);
  const hist = JSON.parse(fs.readFileSync("./data/history.json", "utf8"));
  const hits = hist.filter((h) => String(h.domain || "").toLowerCase().replace(/^www\\./, "") === domain)
    .sort((a, b) => String(b.timestamp || b.updatedAt || "").localeCompare(String(a.timestamp || a.updatedAt || "")));
  const lastOk = hits.find((h) => h.status === "success" || h.status === "ok" || h.liveStatus === "ok") || hits[0];
  const repos = findDomainInRepos(domain);
  let repoLink = null;
  let repoPath = null;
  for (const m of repos) {
    try {
      const j = JSON.parse(fs.readFileSync(m.filePath, "utf8"));
      const e = j[domain] || j[\`www.\${domain}\`];
      if (e) {
        repoLink = e.main_url || e.messenger_url || e.telegram_url || null;
        repoPath = m.filePath;
        break;
      }
    } catch {}
  }
  // page rule if 302
  let pageRule = null;
  try {
    const zone = await findZoneByName(domain);
    if (zone) {
      const rules = await cfRequest(\`/zones/\${zone.id}/pagerules\`, { token: tokenForZone(zone) }).catch(() => []);
      const fwd = (rules || []).find((r) => r.actions?.some((a) => a.id === "forwarding_url"));
      if (fwd) {
        const a = fwd.actions.find((x) => x.id === "forwarding_url");
        pageRule = a?.value?.url || null;
      }
    }
  } catch {}

  return {
    ownerLink: owner?.currentLink || null,
    ownerMode: owner?.mode || null,
    ownerTpl: owner?.templateId || owner?.templateName || null,
    histLink: lastOk?.link || null,
    histStatus: lastOk?.status || null,
    histLive: lastOk?.liveLink || lastOk?.verifiedLink || lastOk?.details?.liveLink || null,
    histAction: lastOk?.actionType || null,
    histTs: lastOk?.timestamp || lastOk?.updatedAt || null,
    repoLink,
    repoPath,
    pageRule,
  };
}

const rows = [];
for (const d of domains) {
  const hub = await hubLink(d);
  const live = await probeLive(d);
  const liveLink = live.location || live.liveLink || null;
  const hubDisplay = hub.ownerLink || hub.histLink || hub.repoLink || hub.pageRule || null;
  rows.push({
    domain: d,
    expectedTelegram: expected[d],
    hubDisplay,
    hubOwner: hub.ownerLink,
    hubHist: hub.histLink,
    hubHistLive: hub.histLive,
    hubRepo: hub.repoLink,
    hubPageRule: hub.pageRule,
    ownerMode: hub.ownerMode,
    ownerTpl: hub.ownerTpl,
    histAction: hub.histAction,
    histTs: hub.histTs,
    liveMode: live.mode,
    liveHttp: live.http,
    liveLink,
    liveErr: live.err,
    matchHubVsLive: normLink(hubDisplay) && liveLink ? normLink(hubDisplay) === normLink(liveLink) : null,
    matchExpectedVsLive: liveLink ? normLink(expected[d]) === normLink(liveLink) : null,
  });
  console.log("\\n====", d, "====");
  console.log(JSON.stringify(rows[rows.length - 1], null, 2));
}
fs.writeFileSync("/tmp/_link_mismatch_7.json", JSON.stringify(rows, null, 2));
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
