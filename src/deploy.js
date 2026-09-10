import {
  checkDomainAvailability,
  getDomainInfo,
  registerDomain,
  resolveContactId,
  updateNameservers,
} from "./spaceship.js";
import {
  finishCloudflareAfterNs,
  setupCloudflare,
} from "./cloudflare.js";
import { upsertDomainLink } from "./github.js";
import {
  normalizeDomain,
  normalizeUrl,
  printOk,
  printStep,
  printWarn,
} from "./utils.js";

function formatPrice(info) {
  const pricing = info?.premiumPricing?.find((p) => p.operation === "register") ?? info?.premiumPricing?.[0];
  if (!pricing) return "không rõ giá";
  return `${pricing.price} ${pricing.currency}`;
}

export async function runCheck(domainInput) {
  const domain = normalizeDomain(domainInput);
  const info = await checkDomainAvailability(domain);

  console.log(`\nDomain: ${domain}`);
  console.log(`Trạng thái: ${info.result}`);
  if (info.result === "available") {
    console.log(`Giá đăng ký: ${formatPrice(info)}`);
  }

  return info;
}

export async function runContacts() {
  const list = await listDomainsSafe();
  if (!list.length) {
    console.log("\nChưa có domain nào trên Spaceship account.");
    console.log("Sau khi mua domain đầu tiên (dashboard hoặc tool), chạy lại lệnh này.");
    return;
  }

  console.log("\nContact ID từ domain có sẵn (copy vào .env → SPACESHIP_CONTACT_ID):\n");
  for (const item of list) {
    const c = item.contacts ?? {};
    console.log(`  ${item.unicodeName ?? item.name}`);
    console.log(`    registrant: ${c.registrant ?? "-"}`);
    console.log(`    admin:      ${c.admin ?? "-"}`);
    console.log("");
  }
}

async function listDomainsSafe() {
  const { listDomains } = await import("./spaceship.js");
  const data = await listDomains(10, 0);
  return data?.items ?? [];
}

export async function runDeploy(domainInput, linkInput, options = {}) {
  const domain = normalizeDomain(domainInput);
  const link = normalizeUrl(linkInput);
  const dryRun = Boolean(options.dryRun);
  const skipBuy = Boolean(options.skipBuy);

  printStep("0", `Deploy ${domain} → ${link}${dryRun ? " (DRY RUN)" : ""}`);

  printStep("1", "Check availability trên Spaceship");
  const availability = await checkDomainAvailability(domain);
  printOk(`Trạng thái: ${availability.result}`);

  if (availability.result === "available" && !skipBuy) {
    printOk(`Giá: ${formatPrice(availability)}`);
    if (dryRun) {
      printWarn("Dry run — bỏ qua mua miền");
    } else {
      printStep("2", "Mua miền trên Spaceship");
      const contactId = await resolveContactId();
      await registerDomain(domain, contactId);
      printOk("Mua miền thành công");
    }
  } else if (availability.result !== "available") {
    if (skipBuy) {
      printWarn("Miền không available nhưng --skip-buy: tiếp tục với miền đã sở hữu");
    } else {
      try {
        await getDomainInfo(domain);
        printWarn("Miền đã thuộc account Spaceship — bỏ qua bước mua");
      } catch {
        throw new Error(`Miền không available (${availability.result}) và không thuộc account bạn`);
      }
    }
  }

  printStep("3", "Setup Cloudflare zone + lấy nameservers");
  let cf;
  if (dryRun) {
    printWarn("Dry run — bỏ qua Cloudflare API");
    cf = { nameservers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], needsNsPropagation: true };
  } else {
    cf = await setupCloudflare(domain);
    printOk(`Zone: ${cf.zone.name} (${cf.zone.status})`);
    printOk(`NS: ${cf.nameservers.join(", ")}`);
  }

  if (!dryRun) {
    printStep("4", "Trỏ NS Spaceship → Cloudflare");
    await updateNameservers(domain, cf.nameservers);
    printOk("Đã cập nhật nameservers trên Spaceship");
  } else {
    printWarn("Dry run — bỏ qua đổi NS");
  }

  if (!dryRun && cf.needsNsPropagation) {
    printStep("5", "Chờ NS propagate + hoàn tất CF Pages");
    printWarn("Zone chưa Active — tool sẽ poll tối đa 10 phút...");
    try {
      const finished = await finishCloudflareAfterNs(domain);
      printOk(`Pages domain: ${finished.pagesDomain}`);
      printOk(`CNAME → ${finished.cname.target}`);
    } catch (err) {
      printWarn(`Chưa Active kịp: ${err.message}`);
      printWarn("Chạy lại sau: node bin/cli.js deploy " + domain + " " + link + " --skip-buy");
    }
  } else if (!dryRun) {
    printOk("CF Pages domain + CNAME đã setup");
  }

  printStep("6", "Cập nhật domains.json trên GitHub");
  if (dryRun) {
    printWarn(`Dry run — sẽ thêm: "${domain}": "${link}"`);
  } else {
    await upsertDomainLink(domain, link);
    printOk("Đã push domains.json → CF Pages sẽ auto deploy");
  }

  console.log("\n✅ Xong!");
  if (!dryRun) {
    console.log(`   Test: https://${domain}`);
    console.log(`   JSON: https://${domain}/domains.json`);
  }
}
