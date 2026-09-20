import { Client } from "ssh2";

const remoteScript = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import { setupDirect302Redirect } from "./src/cloudflare.js";
import { updateNameservers } from "./src/spaceship.js";
import { assignDomain } from "./src/ownership.js";
import { updateHistoryItem } from "./src/history.js";
import { completeTask, updateTaskProgress } from "./src/task-queue.js";

const domain = "gg88mt.com";
const link = "https://gg8826.com/?id=731675859";
const taskId = "task_1789305542143_8sxjd";
const histId = "hist_1789305542142_bzubi";

console.log("[1] setupDirect302Redirect...");
const t0 = Date.now();
const cf = await setupDirect302Redirect(domain, link);
console.log("[1] done", Math.round((Date.now()-t0)/1000)+"s", {
  zoneId: cf.zone?.id,
  status: cf.zone?.status,
  ns: cf.nameservers,
  account: cf.accountName,
  pageRule: cf.pageRule?.action || cf.pageRule?.status || Object.keys(cf.pageRule||{}),
});

if (cf.nameservers?.length) {
  console.log("[2] updateNameservers...", cf.nameservers);
  try {
    await updateNameservers(domain, cf.nameservers);
    console.log("[2] NS updated OK");
  } catch (e) {
    console.error("[2] NS update warn:", e.message);
  }
} else {
  console.warn("[2] no nameservers returned");
}

console.log("[3] ownership + task/history...");
assignDomain(domain, "u_admin", { mode: "302", currentLink: link, templateId: null });

try {
  updateTaskProgress(taskId, 95, "Đã cài 302 — đang hoàn tất...", "Manual finish after PM2 restart", "info");
} catch {}

updateHistoryItem(histId, {
  status: "success",
  progress: null,
  error: null,
  link,
  actionType: "BUY_302",
  actionLabel: "Mua & Trỏ 302 Trực Tiếp",
  templateName: "302 Redirect",
  isBuy: true,
  cfAccount: cf.accountName || "Cloudflare",
  details: { finishedManually: true, reason: "PM2 restart killed in-flight job", nameservers: cf.nameservers },
});

completeTask(taskId, { domain, link, mode: "302", nameservers: cf.nameservers }, \`Đã cài 302 cho \${domain}\`);

console.log("[4] verify dig NS");
console.log("DONE");
NODE

echo '=== dig NS ==='
dig +short NS gg88mt.com @8.8.8.8
echo '=== zone check ==='
set -a; . /var/www/web-ten-mien/.env; set +a
curl -sS "https://api.cloudflare.com/client/v4/zones?name=gg88mt.com" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import sys,json;j=json.load(sys.stdin);z=(j.get("result") or [None])[0]; print(z and {"id":z["id"],"status":z["status"],"ns":z.get("name_servers")} or "NO")'
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remoteScript, { pty: false }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
