import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh

node --input-type=module <<'NODE'
import { listDomains, getDomainInfo } from "./src/spaceship.js";
import fs from "fs";

const TARGET = "gg88dt.com";

// Paginate all Spaceship domains
const all = [];
let offset = 0;
const take = 100;
while (true) {
  const page = await listDomains(take, offset);
  const items = page?.items || page?.domains || (Array.isArray(page) ? page : []);
  if (!items.length) break;
  all.push(...items);
  if (items.length < take) break;
  offset += take;
  if (offset > 5000) break;
}
console.log("SPACESHIP_TOTAL", all.length);

function createdOf(d) {
  return d.registrationDate || d.createdAt || d.created || d.registeredAt || d.registration?.date || null;
}

const enriched = all.map((d) => {
  const name = (d.name || d.domain || "").toLowerCase();
  return {
    name,
    created: createdOf(d),
    expires: d.expirationDate || d.expiresAt || d.expiryDate || null,
    status: d.status || d.lifecycleStatus || null,
    autoRenew: d.autoRenew ?? d.autoreneW ?? null,
  };
}).filter((d) => d.name);

enriched.sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));

const target = enriched.find((d) => d.name === TARGET);
console.log("TARGET", JSON.stringify(target || null));

if (!target?.created) {
  // try getDomainInfo
  try {
    const info = await getDomainInfo(TARGET);
    console.log("TARGET_INFO", JSON.stringify({
      name: info?.name,
      created: info?.registrationDate || info?.createdAt,
      expires: info?.expirationDate,
      ns: info?.nameservers,
      rawKeys: Object.keys(info || {}),
    }));
  } catch (e) {
    console.log("TARGET_INFO_ERR", e.message);
  }
}

const anchor = target?.created || null;
let after = [];
if (anchor) {
  after = enriched.filter((d) => d.created && d.created >= anchor);
} else {
  after = [];
}

// Also dump sample keys from first item for debugging
if (all[0]) console.log("SAMPLE_KEYS", Object.keys(all[0]));
if (all[0]) console.log("SAMPLE", JSON.stringify(all[0]).slice(0, 800));

const out = {
  generatedAt: new Date().toISOString(),
  target: TARGET,
  targetCreated: anchor,
  totalOnSpaceship: enriched.length,
  countFromTargetInclusive: after.length,
  domains: after,
};
fs.writeFileSync("/tmp/_spaceship_from_gg88dt.json", JSON.stringify(out, null, 2));
console.log("WROTE", after.length);

// Print table
for (const d of after) {
  console.log([d.created, d.expires, d.name, d.status].join("\\t"));
}
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
