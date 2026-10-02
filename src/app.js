import "./config.js";
import { startServer } from "./server.js";
import { startBackgroundVerifier } from "./verifier.js";
import { queryEnrichedDomainsList } from "./domains-list-service.js";
import { initMongoStores, loadAllStores } from "./mongo-stores.js";
import { reconcileStaleHistory } from "./history.js";
import { reconcileStaleTasks } from "./task-queue.js";

async function main() {
  console.log("=============================================================");
  console.log("🚀 KHỞI ĐỘNG LANDING PAGE HUB (WEB ONLY)");
  console.log("=============================================================\n");

  await initMongoStores();
  await loadAllStores();
  // Job không sống qua restart. Đóng hết RUNNING / in_progress còn sót trước khi nhận request.
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
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
});
