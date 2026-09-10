async function verifyAll() {
  const urls = [
    "https://tenmienbet.top/",
    "https://www.tenmienbet.top/",
    "https://tenmienbet.top/login",
    "https://tenmienbet.top/style.css",
    "https://tenmienbet.top/app.js",
    "https://tenmienbet.top/api/templates",
    "https://tenmienbet.top/api/history"
  ];

  console.log("=========================================");
  console.log("🔍 KIỂM TRA CÁC ĐƯỜNG DẪN TRÊN LIVE SERVER");
  console.log("=========================================");

  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { "Cache-Control": "no-cache" } });
      const cType = res.headers.get("content-type") || "";
      console.log(`[${res.status}] ${u} -> Type: ${cType}`);
    } catch (err) {
      console.error(`[ERR] ${u}:`, err.message);
    }
  }
}

verifyAll();
