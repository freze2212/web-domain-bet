import { Client } from "ssh2";

const remoteScript = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { addPagesDomain, ensurePagesCname, deleteForwardingPageRules, findZoneByName } from "./src/cloudflare.js";
import { assignDomain } from "./src/ownership.js";
import { updateHistoryItem } from "./src/history.js";
import { completeTask, updateTaskProgress } from "./src/task-queue.js";

const domain = "gg88hg.com";
const link = "https://www.gg8850.com/?id=717746667";
const tele = link;
const templateId = "lp_gg88_vip_2";
const taskId = "task_1789305525820_b6ob1";
const histId = "hist_1789305525819_jtnyi";

const template = getTemplate(templateId);
if (!template) throw new Error("missing template " + templateId);
console.log("template", { id: template.id, pagesProject: template.pagesProject, cnameTarget: template.cnameTarget, path: template.path });

const zone = await findZoneByName(domain);
console.log("zone", zone?.id, zone?.status);
if (zone?.id) await deleteForwardingPageRules(zone.id).catch((e)=>console.warn("del pr", e.message));

console.log("[1] addPagesDomain...");
const t0 = Date.now();
const pagesOpts = {};

let finalTarget = template.cnameTarget;
const pagesResult = await addPagesDomain(domain, template.pagesProject, template.path, pagesOpts);
console.log("[1] pages", Math.round((Date.now()-t0)/1000)+"s", pagesResult);
if (pagesResult?.canonicalSubdomain) finalTarget = pagesResult.canonicalSubdomain;

console.log("[2] ensurePagesCname...", finalTarget);
await ensurePagesCname(domain, finalTarget);
console.log("[2] cname ok");

console.log("[3] domains.json...");
await updateTemplateDomainsJson(template, domain, link, tele);
console.log("[3] synced");

assignDomain(domain, "u_admin", {
  mode: "LP",
  currentLink: link,
  tele,
  templateId: template.id,
  templateName: template.name,
  cnameTarget: finalTarget,
});

try { updateTaskProgress(taskId, 95, "Đang hoàn tất (manual after PM2 restart)...", "finish LP", "info"); } catch {}

updateHistoryItem(histId, {
  status: "success",
  progress: null,
  error: null,
  link,
  tele,
  templateId: template.id,
  templateName: template.name,
  cnameTarget: finalTarget,
  actionType: "BUY_LP",
  isBuy: true,
  details: { finishedManually: true, reason: "PM2 restart killed in-flight job" },
});

completeTask(taskId, { domain, link, templateName: template.name, cnameTarget: finalTarget }, \`Đã cài \${domain} — \${template.name}\`);
console.log("DONE", finalTarget);
NODE

echo '=== DNS ==='
dig +short gg88hg.com CNAME @1.1.1.1
dig +short www.gg88hg.com CNAME @1.1.1.1
dig +short gg88hg.com A @1.1.1.1
sleep 3
curl -sI --max-time 25 https://gg88hg.com/ 2>&1 | head -20
echo '--- domains.json ---'
curl -sS --max-time 15 https://gg88hg.com/domains.json 2>&1 | head -c 400; echo
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remoteScript, (e, s) => {
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
