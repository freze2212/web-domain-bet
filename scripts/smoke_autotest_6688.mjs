/**
 * Smoke + flow checklist for hub APIs using autotest-6688.top
 * Env: HUB_BASE (default http://127.0.0.1:3000), ADMIN_USER, ADMIN_PASS
 */
const BASE = process.env.HUB_BASE || "http://127.0.0.1:3000";
const DOMAIN = process.env.TEST_DOMAIN || "autotest-6688.top";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"} | ${name}${detail ? " — " + detail : ""}`);
}

async function api(method, path, { token, body, headers } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text: text.slice(0, 300) };
}

async function main() {
  console.log(`HUB=${BASE} DOMAIN=${DOMAIN}\n`);

  // 1) public simulate-pay blocked without auth
  {
    const r = await api("POST", "/api/wallet/simulate-pay", { body: { username: "admin", amount: 1 } });
    log("simulate-pay public blocked", r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // 2) webhook without secret
  {
    const r = await api("POST", "/api/wallet/webhook-pay", { body: { description: "NAP admin", amount: 1000 } });
    log("webhook-pay requires secret", r.status === 401 || r.status === 503, `status=${r.status} ${r.json?.error || ""}`);
  }

  // 3) login admin
  const login = await api("POST", "/api/auth/login", { body: { username: ADMIN_USER, password: ADMIN_PASS } });
  if (!login.json?.token && !login.json?.success) {
    log("admin login", false, login.text);
    console.table(results);
    process.exit(1);
  }
  const token = login.json.token || login.json?.accessToken;
  log("admin login", !!token, ADMIN_USER);

  // 4) templates
  {
    const r = await api("GET", "/api/templates");
    log("GET /api/templates", r.status === 200 && (r.json?.templates || r.json?.length || r.json?.success), `status=${r.status}`);
  }

  // 5) domain-requests API exists
  {
    const r = await api("GET", "/api/domain-requests", { token });
    log("GET /api/domain-requests", r.status === 200 && r.json?.success !== false, `status=${r.status}`);
  }

  // 6) domain-orders API exists
  {
    const r = await api("GET", "/api/domain-orders", { token });
    log("GET /api/domain-orders", r.status === 200 && r.json?.success !== false, `status=${r.status}`);
  }

  // 7) ownership admin-only (already admin — should 200)
  {
    const r = await api("GET", "/api/admin/ownership", { token });
    log("GET /api/admin/ownership (admin)", r.status === 200, `status=${r.status}`);
  }

  // 8) resolve-link / inspect for test domain
  {
    const r = await api("GET", `/api/resolve-link?domain=${encodeURIComponent(DOMAIN)}`, { token });
    log("resolve-link", r.status === 200 || r.status === 403, `status=${r.status} link=${r.json?.link || "-"} src=${r.json?.source || "-"}`);
  }

  // 9) set-link (admin)
  {
    const link = `https://www.gg8830.com/?id=autotest_${Date.now()}`;
    const r = await api("POST", "/api/set-link", { token, body: { domain: DOMAIN, link } });
    log("set-link", r.status === 200 && r.json?.success !== false, `status=${r.status} ${r.json?.message || r.json?.error || ""}`);
  }

  // 10) switch-template to gg88_lp_5uae
  {
    const r = await api("POST", "/api/switch-template", {
      token,
      body: { domain: DOMAIN, targetTemplateId: "gg88_lp_5uae", newLink: "" },
    });
    log("switch-template → 5uae", r.status === 200 && r.json?.success, `status=${r.status} ${r.json?.message || r.json?.error || ""} cname=${r.json?.cnameTarget || ""}`);
  }

  // 11) switch-mode LP→302 then back (admin)
  {
    const link = "https://www.gg8830.com/?id=autotest_302";
    const to302 = await api("POST", "/api/tasks/switch-mode", {
      token,
      body: { domain: DOMAIN, toMode: "302", targetUrl: link },
    });
    log("switch-mode → 302", to302.status === 200 && to302.json?.success, `status=${to302.status} ${to302.json?.message || to302.json?.error || ""}`);

    await new Promise((r) => setTimeout(r, 8000));

    const toLp = await api("POST", "/api/tasks/switch-mode", {
      token,
      body: { domain: DOMAIN, toMode: "LP", templateId: "gg88_lp_5uae", targetUrl: link },
    });
    log("switch-mode → LP", toLp.status === 200 && toLp.json?.success, `status=${toLp.status} ${toLp.json?.message || toLp.json?.error || ""}`);
  }

  // 12) live probe
  await new Promise((r) => setTimeout(r, 12000));
  try {
    const live = await fetch(`https://${DOMAIN}/`, { redirect: "manual", signal: AbortSignal.timeout(12000) });
    const loc = live.headers.get("location");
    log("live HTTPS", live.status === 200 || live.status === 301 || live.status === 302, `status=${live.status} loc=${loc || "null"}`);
    if (live.status === 200) {
      const dj = await fetch(`https://${DOMAIN}/domains.json`, { signal: AbortSignal.timeout(10000) });
      if (dj.ok) {
        const j = await dj.json();
        const e = j[DOMAIN] || j[`www.${DOMAIN}`];
        log("live domains.json has domain", !!e, JSON.stringify(e || null));
      } else {
        log("live domains.json", false, `status=${dj.status}`);
      }
    }
  } catch (e) {
    log("live HTTPS", false, e.message);
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
