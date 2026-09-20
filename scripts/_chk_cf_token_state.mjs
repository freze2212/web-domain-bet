import { Client } from "ssh2";
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

function mask(t) {
  if (!t) return "(empty)";
  return `${t.slice(0, 10)}...${t.slice(-6)} len=${t.length}`;
}

async function verify(label, tok) {
  if (!tok) return console.log(label, "MISSING");
  const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const j = await r.json();
  console.log(label, "mask", mask(tok), "verify", j.success ? j.result?.status : j.errors?.[0]?.message);
}

const localP = process.env.CLOUDFLARE_API_TOKEN || "";
const localA = process.env.CLOUDFLARE_ADMIN_API_TOKEN || "";
const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;

await verify("LOCAL primary", localP);
await verify("LOCAL admin", localA);
console.log("LOCAL primary==admin?", localP === localA);

async function canCreate(label, tok, acc) {
  const r = await fetch("https://api.cloudflare.com/client/v4/zones", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "__perm_probe_not_real_zzz.test", account: { id: acc }, type: "full" }),
  });
  const j = await r.json();
  const msg = j.errors?.[0]?.message || "";
  const noCreate = /zone\.create|create zones/i.test(msg);
  console.log(label, "status", r.status, "msg", msg.slice(0, 140), "| zone.create?", !noCreate);
}

await canCreate("LOCAL primary→Freze", localP, FA);
await canCreate("LOCAL admin→Freze", localA, FA);
await canCreate("LOCAL admin→AdminAcc", localA, AA);

const remotePy = `
from pathlib import Path
import json, urllib.request
p = Path("/var/www/web-ten-mien/.env")
vals = {}
for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip()
pri = vals.get("CLOUDFLARE_API_TOKEN", "")
adm = vals.get("CLOUDFLARE_ADMIN_API_TOKEN", "")
def mask(t):
    return (t[:10] + "..." + t[-6:] + " len=" + str(len(t))) if t else "EMPTY"
print("VPS primary", mask(pri))
print("VPS admin", mask(adm))
print("VPS primary==admin", pri == adm)
req = urllib.request.Request(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    headers={"Authorization": "Bearer " + pri},
)
print("VPS primary verify", json.load(urllib.request.urlopen(req)))
# zone create probe freze
import os
acc = vals.get("CLOUDFLARE_ACCOUNT_ID", "")
body = json.dumps({"name": "__perm_probe_not_real_zzz.test", "account": {"id": acc}, "type": "full"}).encode()
req2 = urllib.request.Request(
    "https://api.cloudflare.com/client/v4/zones",
    data=body,
    headers={"Authorization": "Bearer " + pri, "Content-Type": "application/json"},
    method="POST",
)
try:
    print("VPS createZone", json.load(urllib.request.urlopen(req2)))
except Exception as e:
    if hasattr(e, "read"):
        print("VPS createZone", e.read().decode()[:300])
    else:
        print("VPS createZone", e)
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream("/tmp/_chk_cf_tok.py");
    ws.on("close", () => {
      c.exec("python3 /tmp/_chk_cf_tok.py; rm -f /tmp/_chk_cf_tok.py", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o.trim());
          c.end();
        });
      });
    });
    ws.end(Buffer.from(remotePy, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
