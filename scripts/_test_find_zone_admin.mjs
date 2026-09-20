import fs from "node:fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}
const { findZoneByName, isAdminAccountZone, tokenForZone } = await import("../src/cloudflare.js");
for (const d of ["ll886.us", "gg86.us", "autotest-6888.top"]) {
  const z = await findZoneByName(d);
  console.log(
    d,
    z
      ? {
          id: z.id,
          status: z.status,
          acc: z.account?.name,
          admin: isAdminAccountZone(z),
          tok: tokenForZone(z).slice(0, 10) + "...",
        }
      : null
  );
}
