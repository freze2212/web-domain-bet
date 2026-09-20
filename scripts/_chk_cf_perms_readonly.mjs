/**
 * READ-ONLY: check CF Freze vs Admin tokens + what each can do.
 * Do not modify .env / VPS / CF.
 */
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
  return `${t.slice(0, 10)}...${t.slice(-6)} len=${t.length} idhint=${t.slice(5, 13)}`;
}

async function cf(tok, method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!j.success, errors: j.errors || [], result: j.result, messages: j.messages };
}

async function probe(label, tok, frezeAcc, adminAcc) {
  console.log("\n==", label, mask(tok), "==");
  if (!tok) {
    console.log("  MISSING");
    return;
  }
  const v = await cf(tok, "GET", "/user/tokens/verify");
  console.log("  verify", v.ok ? v.result?.status : v.errors[0]?.message);

  // list pages freze
  const pf = await cf(tok, "GET", `/accounts/${frezeAcc}/pages/projects?per_page=1`);
  console.log(
    "  Pages LIST Freze",
    pf.ok ? "OK" : `FAIL ${pf.errors[0]?.message || pf.status}`
  );

  // get one known freze project
  const pg = await cf(tok, "GET", `/accounts/${frezeAcc}/pages/projects/lp-gg88-vip-2`);
  console.log(
    "  Pages GET lp-gg88-vip-2 Freze",
    pg.ok ? `OK source=${pg.result?.source?.type || "direct"}` : `FAIL ${pg.errors[0]?.message || pg.status}`
  );

  // list zones freze
  const zf = await cf(tok, "GET", `/zones?account.id=${encodeURIComponent(frezeAcc)}&per_page=1`);
  console.log(
    "  Zones LIST Freze",
    zf.ok ? `OK n=${(zf.result || []).length}` : `FAIL ${zf.errors[0]?.message || zf.status}`
  );

  // DNS read on known freze zone if any
  if (zf.ok && zf.result?.[0]) {
    const zid = zf.result[0].id;
    const dns = await cf(tok, "GET", `/zones/${zid}/dns_records?per_page=1`);
    console.log(
      "  DNS READ Freze zone",
      zf.result[0].name,
      dns.ok ? "OK" : `FAIL ${dns.errors[0]?.message || dns.status}`
    );
  }

  // zone CREATE probe (fake name) — read-only intent: no real zone
  const createF = await cf(tok, "POST", "/zones", {
    name: "__hub_perm_probe_never_create__.invalid",
    account: { id: frezeAcc },
    type: "full",
  });
  console.log(
    "  Zone CREATE Freze",
    createF.ok
      ? "UNEXPECTED OK (would create — should not happen with .invalid)"
      : `blocked: ${createF.errors[0]?.message || createF.status}`
  );

  const createA = await cf(tok, "POST", "/zones", {
    name: "__hub_perm_probe_never_create__.invalid",
    account: { id: adminAcc },
    type: "full",
  });
  console.log(
    "  Zone CREATE AdminAcc",
    createA.ok
      ? "UNEXPECTED OK"
      : `blocked: ${createA.errors[0]?.message || createA.status}`
  );

  // skip Pages write probes (user asked read-only)
  console.log("  Pages WRITE Freze", "(skipped — read-only check)");
}

const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const localP = process.env.CLOUDFLARE_API_TOKEN || "";
const localA = process.env.CLOUDFLARE_ADMIN_API_TOKEN || "";

console.log("LOCAL env keys present:");
console.log("  CLOUDFLARE_ACCOUNT_ID (Freze)", FA);
console.log("  CLOUDFLARE_ADMIN_ACCOUNT_ID", AA);
console.log("  primary==admin?", localP === localA);

await probe("LOCAL CLOUDFLARE_API_TOKEN (primary)", localP, FA, AA);
if (localA !== localP) {
  await probe("LOCAL CLOUDFLARE_ADMIN_API_TOKEN", localA, FA, AA);
} else {
  console.log("\n(LOCAL admin token identical to primary — skip duplicate probe)");
}

// VPS read-only
const remotePy = `
from pathlib import Path
p = Path("/var/www/web-ten-mien/.env")
vals = {}
for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip()
keys = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ADMIN_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ADMIN_ACCOUNT_ID",
]
for k in keys:
    v = vals.get(k, "")
    if "TOKEN" in k:
        print(k, (v[:10]+"..."+v[-6:]+" len="+str(len(v))) if v else "EMPTY")
    else:
        print(k, v or "EMPTY")
print("primary==admin", vals.get("CLOUDFLARE_API_TOKEN")==vals.get("CLOUDFLARE_ADMIN_API_TOKEN"))
# also list if old freze-looking token comments
for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
    if "CLOUDFLARE" in line.upper() and ("#" in line or "TOKEN" in line.upper() or "ACCOUNT" in line.upper()):
        if "TOKEN" in line.upper():
            # redact
            if "=" in line and not line.strip().startswith("#"):
                k,v=line.split("=",1)
                v=v.strip()
                print("LINE", k.strip(), (v[:10]+"..."+v[-6:]) if v else "")
            else:
                print("LINE", line[:80])
`;

await new Promise((resolve, reject) => {
  const c = new Client();
  c.on("ready", () => {
    c.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream("/tmp/_chk_cf_ro.py");
      ws.on("close", () => {
        c.exec("python3 /tmp/_chk_cf_ro.py; rm -f /tmp/_chk_cf_ro.py", (e2, st) => {
          let o = "";
          st.on("data", (d) => (o += d));
          st.stderr.on("data", (d) => (o += d));
          st.on("close", () => {
            console.log("\n== VPS .env (redacted) ==");
            console.log(o.trim());
            c.end();
            resolve();
          });
        });
      });
      ws.end(Buffer.from(remotePy, "utf8"));
    });
  });
  c.on("error", reject);
  c.connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
});

console.log("\nDONE read-only check");
