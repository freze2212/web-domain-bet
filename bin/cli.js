#!/usr/bin/env node

import { validateFor } from "../src/config.js";
import { runCheck, runContacts, runDeploy } from "../src/deploy.js";
import { printErr } from "../src/utils.js";

function usage() {
  console.log(`
Domain Deploy Tool — Spaceship + Cloudflare Pages + GitHub

Usage:
  node bin/cli.js setup
  node bin/cli.js check <domain>
  node bin/cli.js contacts
  node bin/cli.js deploy <domain> <link> [--dry-run] [--skip-buy]

Examples:
  node bin/cli.js check g8us.top
  node bin/cli.js contacts
  node bin/cli.js deploy g8us.top https://link-hd.com --dry-run
  node bin/cli.js deploy g8us.top https://link-hd.com
  node bin/cli.js deploy g8us.top https://link-hd.com --skip-buy
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const flags = {
    dryRun: args.includes("--dry-run"),
    skipBuy: args.includes("--skip-buy"),
  };
  const positional = args.filter((a) => !a.startsWith("--"));
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    usage();
    process.exit(command ? 0 : 1);
  }

  const missing = validateFor(command === "setup" ? "check" : command);
  if (missing.length) {
    printErr("Thiếu cấu hình trong file .env:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error("\nCopy .env.example → .env rồi điền thông tin.");
    console.error("Hướng dẫn lấy API key: xem README.md");
    process.exit(1);
  }

  try {
    switch (command) {
      case "setup": {
        const all = validateFor("deploy");
        if (all.length) {
          console.log("Chưa đủ config cho deploy. Còn thiếu:");
          for (const key of all) console.log(`  - ${key}`);
        } else {
          console.log("✓ Config đủ cho deploy");
        }
        break;
      }
      case "check":
        if (!positional[1]) throw new Error("Thiếu domain. VD: node bin/cli.js check g8us.top");
        await runCheck(positional[1]);
        break;
      case "contacts":
        await runContacts();
        break;
      case "deploy":
        if (!positional[1] || !positional[2]) {
          throw new Error("Thiếu tham số. VD: node bin/cli.js deploy g8us.top https://link-hd.com");
        }
        await runDeploy(positional[1], positional[2], flags);
        break;
      default:
        usage();
        process.exit(1);
    }
  } catch (err) {
    printErr(err.message);
    process.exit(1);
  }
}

main();
