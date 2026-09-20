import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";

const j5 = JSON.parse(fs.readFileSync("/var/www/Landingpages/GG88/landing-page-5f/domains.json","utf8"));
const j3 = JSON.parse(fs.readFileSync("/var/www/Landingpages/GG88/3f-thanhnhan/domains.json","utf8"));

function apexKeys(j) {
  return [...new Set(Object.keys(j).map(k => k.toLowerCase().replace(/^www\\./,"")))].filter(Boolean).sort();
}
function linkOf(j,d) {
  const e = j[d] || j["www."+d];
  return e?.main_url || (typeof e === "string" ? e : null);
}

const a5 = apexKeys(j5);
const a3 = apexKeys(j3);
const both = a5.filter(d => a3.includes(d));
console.log("5f_domains", a5.length);
console.log("3f_domains", a3.length);
console.log("in_BOTH_json", both.length, both.join(", "));

// Domains only in 3f — check if DNS actually points to 5f (wrong write victims)
const only3 = a3.filter(d => !a5.includes(d));
const wrong = [];
for (const d of only3) {
  try {
    const zone = await findZoneByName(d);
    if (!zone) continue;
    const recs = await cfRequest("/zones/"+zone.id+"/dns_records", { token: tokenForZone(zone) });
    const cn = (recs||[]).find(r => r.type==="CNAME" && (r.name===d || r.name==="www."+d));
    const t = (cn?.content||"").toLowerCase();
    if (t.includes("landingpage-5f-g")) wrong.push({d, cname:t, link3: linkOf(j3,d)});
  } catch {}
}
console.log("\\nONLY_in_3f_but_CNAME_5f (sai chỗ ghi)", wrong.length);
for (const w of wrong) console.log(w.d, w.link3);

// For both-json: live probe mismatch vs 5f (source of truth for 5f CNAME sites)
console.log("\\nBOTH_json live check vs 5f link:");
const badLive = [];
const okLive = [];
for (const d of both) {
  const expect = linkOf(j5,d);
  let live = null;
  try {
    const j = await (await fetch("https://"+d+"/domains.json", { headers:{"user-agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(12000) })).json();
    live = linkOf(j,d);
  } catch (e) { live = "ERR:"+e.message.slice(0,40); }
  const row = { d, expect, live, ok: live && expect && String(live)===String(expect) };
  if (row.ok) okLive.push(d); else badLive.push(row);
}
console.log("both_ok", okLive.length, "both_bad", badLive.length);
for (const b of badLive) console.log("BAD", b.d, "expect=", b.expect, "live=", b.live);

// Also probe wrong[] live
console.log("\\nWRONG_write live (expect should be NEW in 3f but 5f serves):");
for (const w of wrong) {
  let live=null;
  try {
    const j = await (await fetch("https://"+w.d+"/domains.json",{headers:{"user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)})).json();
    live = linkOf(j,w.d);
  } catch(e){ live="ERR"; }
  const in5 = linkOf(j5,w.d);
  console.log(w.d, "live=", live, "5fJson=", in5, "3fJson=", w.link3);
}
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => { console.log(o || "(empty)"); c.end(); });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
