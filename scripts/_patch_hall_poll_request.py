from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

old = '''    if (hallOnly) {
      // Node-side fetch — không đụng iframe (tránh detach làm chết luồng)
      const cookieHeader = cookies.map((c) => c.name + "=" + c.value).join("; ");
      try {
        const resp = await axios.post(url, "gameGroupId=2", {
          timeout: 8000,
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            accept: "application/json, text/plain, */*",
            cookie: cookieHeader,
          },
          validateStatus: () => true,
        });
        if (resp.status >= 200 && resp.status < 300 && resp.data && typeof resp.data === "object") {
          hallData = resp.data;
        } else {
          pollPreview =
            "status=" +
            resp.status +
            " preview=" +
            String(typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data || "")).slice(0, 80);
        }
      } catch (axErr) {
        pollPreview = "axios=" + (axErr.message || axErr);
      }
    } else {'''

new = '''    if (hallOnly) {
      // Dùng Playwright APIRequest (cookie jar browser) — không evaluate iframe
      try {
        const api = page.context().request;
        const resp = await api.post(url, {
          timeout: 8000,
          form: { gameGroupId: "2" },
          headers: {
            accept: "application/json, text/plain, */*",
          },
        });
        const status = resp.status();
        const raw = await resp.text();
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = null;
        }
        if (status >= 200 && status < 300 && parsed && typeof parsed === "object") {
          hallData = parsed;
        } else {
          pollPreview =
            "status=" +
            status +
            " len=" +
            String(raw || "").length +
            " preview=" +
            String(raw || "").replace(/\\s+/g, " ").slice(0, 120);
        }
      } catch (axErr) {
        pollPreview = "request=" + (axErr.message || axErr);
      }
    } else {'''

if old not in text:
    raise SystemExit("axios poll block not found")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")
print("OK patched to page.request")
