import { startServer } from "./server.js";
import { startBot } from "./bot.js";
import { startBackgroundVerifier } from "./verifier.js";

async function main() {
  console.log("=============================================================");
  console.log("🚀 KHỞI ĐỘNG HỆ THỐNG LANDING PAGE HUB & TELEGRAM BOT");
  console.log("=============================================================\n");

  const port = process.env.PORT || 3000;
  const { port: actualPort } = await startServer(port);
  console.log(`✨ Web Dashboard: http://localhost:${actualPort}`);

  // Khởi động tiến trình ngầm kiểm tra HTTP 200 & Auto Capture ảnh screenshot (30s)
  startBackgroundVerifier(30000);

  await startBot();
}


main().catch((err) => {
  console.error("❌ Fatal Error:", err);
});
