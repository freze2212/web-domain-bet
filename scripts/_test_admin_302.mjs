import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const { findZoneByName, tokenForZone, cfRequestFull } = await import("../src/cloudflare.js");
const z = await findZoneByName("kjctong.net");
const tok = tokenForZone(z);
const zoneId = z.id;

async function tryPath(label, path, opts = {}) {
  try {
    const r = await cfRequestFull(path, { token: tok, ...opts });
    console.log(label, "OK", JSON.stringify(r.result || r).slice(0, 300));
    return r;
  } catch (e) {
    console.log(label, "ERR", e.message);
    return null;
  }
}

await tryPath("rulesets list", `/zones/${zoneId}/rulesets`);
await tryPath("dyn entry get", `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);

const freze = await findZoneByName("autotest-6888.top");
await tryPath(
  "freze pagerules GET",
  `/zones/${freze.id}/pagerules`,
  { token: process.env.CLOUDFLARE_API_TOKEN }
);

const body = {
  rules: [
    {
      expression: '(http.host eq "kjctong.net") or (http.host eq "www.kjctong.net")',
      description: "Hub 302 redirect",
      action: "redirect",
      action_parameters: {
        from_value: {
          status_code: 302,
          target_url: { value: "https://example.com/" },
          preserve_query_string: true,
        },
      },
      enabled: true,
    },
  ],
};
await tryPath("put dyn redirect", `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
  method: "PUT",
  body,
});

// Also try freze token on admin zone pagerules
await tryPath("admin zone pagerules freze-token", `/zones/${zoneId}/pagerules`, {
  token: process.env.CLOUDFLARE_API_TOKEN,
});
await tryPath("admin zone pagerules POST freze-token", `/zones/${zoneId}/pagerules`, {
  method: "POST",
  token: process.env.CLOUDFLARE_API_TOKEN,
  body: {
    targets: [{ target: "url", constraint: { operator: "matches", value: "*kjctong.net/*" } }],
    actions: [{ id: "forwarding_url", value: { url: "https://example.com/", status_code: 302 } }],
    status: "active",
  },
});
