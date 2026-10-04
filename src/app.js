import "./config.js";
import { startServer } from "./server.js";
import { startBackgroundVerifier } from "./verifier.js";
import { queryEnrichedDomainsList } from "./domains-list-service.js";
import { initMongoStores, loadAllStores } from "./mongo-stores.js";
import { reconcileStaleHistory } from "./history.js";
import { reconcileStaleTasks } from "./task-queue.js";
import { adoptInterrupted302Jobs } from "./zone-302-wait.js";
import { startPagesDomainMapRefresher } from "./pages-domain-map.js";
import { listAllDomains } from "./repo-scanner.js";

async function main() {
  console.log("=============================================================");
  console.log("🚀 KHỞI ĐỘNG LANDING PAGE HUB (WEB ONLY)");
  console.log("=============================================================\n");

  await initMongoStores();
  await loadAllStores();
  // Job 302 đã mua xong miền → chuyển sang chờ zone để tự chạy tiếp; còn lại không sống qua restart thì đóng.
  try {
    const adopted = await adoptInterrupted302Jobs();
    if (adopted) console.log(`[302-wait] Nhận lại ${adopted} job 302 bị restart cắt ngang`);
  } catch (e) {
    console.error("[302-wait] adoptInterrupted302Jobs:", e.message);
  }
  reconcileStaleTasks(0);
  reconcileStaleHistory(0);

  const port = process.env.PORT || 3000;
  const { port: actualPort } = await startServer(port);
  console.log(`✨ Web Dashboard: http://localhost:${actualPort}`);

  // Warm domains list cache so first UI search isn't 40s+
  setImmediate(() => {
    try {
      const t0 = Date.now();
      const r = queryEnrichedDomainsList({ isAdminUser: true, userAllowedDomains: null }, { page: 1, limit: 1 });
      console.log(`[WARM] domains-list ${r.total} miền — ${Date.now() - t0}ms`);
    } catch (e) {
      console.warn("[WARM] domains-list failed:", e.message);
    }
  });

  startBackgroundVerifier(30000);
  startPagesDomainMapRefresher(() => listAllDomains().map((d) => d.domain));
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
});
