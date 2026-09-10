/**
 * Run remaining DIRECT→Git migrations from data/_migrate_remaining_plan.json
 */
import fs from "fs";
import { spawn } from "child_process";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    console.error(`\n##### ${cmd} ${args.join(" ")}`);
    const p = spawn("node", [cmd, ...args], { stdio: "inherit", shell: true });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}`));
    });
  });
}

const plan = JSON.parse(fs.readFileSync("data/_migrate_remaining_plan.json", "utf8")).map((p) => ({
  ...p,
  branch: p.old === "lp-gg88-mx" ? "master" : "main",
}));
const created = new Set();
const report = [];

for (const item of plan) {
  if (!item.exists || item.custom === 0) {
    report.push({ ...item, status: "skip_empty_or_missing" });
    continue;
  }
  try {
    if (!created.has(item.new)) {
      await run("scripts/migrate-direct-family.mjs", [
        "create-pages",
        item.new,
        item.repo,
        item.branch || "main",
      ]);
      created.add(item.new);
    }
    const declareName = `data/_mig_${item.old}_to_${item.new}_declare.json`;
    await run("scripts/migrate-direct-family.mjs", [
      "prepare",
      item.old,
      item.new,
      item.repo,
      item.branch || "main",
    ]);
    // patch clear
    if (fs.existsSync(declareName)) {
      const j = JSON.parse(fs.readFileSync(declareName, "utf8"));
      j.clearProjects = [item.old, item.new];
      fs.writeFileSync(declareName, JSON.stringify(j, null, 2));
      if (j.summary.needGitSync > 0) {
        await run("scripts/migrate-direct-family.mjs", ["sync-git", declareName]);
      }
      if (j.summary.migrate > 0) {
        await run("scripts/migrate-direct-family.mjs", ["run", declareName, "3"]);
        report.push({
          old: item.old,
          new: item.new,
          status: "done",
          migrate: j.summary.migrate,
          skip: j.summary.skip,
        });
      } else {
        report.push({
          old: item.old,
          new: item.new,
          status: "nothing_to_migrate",
          skip: j.summary.skip,
        });
      }
    }
  } catch (e) {
    report.push({ old: item.old, new: item.new, status: "STOP_CONTINUE", error: e.message });
    fs.writeFileSync("data/_migrate_remaining_report.json", JSON.stringify(report, null, 2));
    console.error("STOP family but CONTINUE pipeline:", e.message);
    continue;
  }
}

fs.writeFileSync("data/_migrate_remaining_report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, report }, null, 2));
