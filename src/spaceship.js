import { config } from "./config.js";

async function spaceshipRequest(path, { method = "GET", body } = {}) {
  const url = `${config.spaceship.baseUrl}${path}`;
  const headers = {
    "X-API-Key": config.spaceship.apiKey(),
    "X-API-Secret": config.spaceship.apiSecret(),
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const asyncId = response.headers.get("spaceship-async-operationid");
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok && response.status !== 202) {
    const detail = data?.detail || data?.message || data?.title || text || response.statusText;
    throw new Error(`Spaceship API ${response.status}: ${detail}`);
  }

  return { response, data, asyncId };
}

export async function checkDomainAvailability(domain) {
  const { data } = await spaceshipRequest(`/v1/domains/${encodeURIComponent(domain)}/available`);
  return data;
}

/** POST batch availability — premium domains trả premiumPricing.register */
export async function checkDomainsAvailabilityBatch(domains) {
  const list = [...new Set((domains || []).map((d) => String(d || "").trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return [];
  const { data } = await spaceshipRequest("/v1/domains/available", {
    method: "POST",
    body: { domains: list.slice(0, 20) },
  });
  return data?.domains || data?.items || [];
}

export function resolvePrivacyLevel(domain) {
  const norm = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  const noPrivacyTlds = [".uk", ".co.uk", ".me.uk", ".org.uk", ".us", ".in", ".ca", ".de", ".nl", ".eu"];
  if (noPrivacyTlds.some((tld) => norm.endsWith(tld))) return "public";
  return config.spaceship.privacyLevel() === "high" ? "high" : "public";
}

function pickRegisterPrice(info) {
  const rows = info?.premiumPricing;
  if (!Array.isArray(rows) || !rows.length) return null;
  const reg = rows.find((p) => p.operation === "register") || rows[0];
  const price = Number(reg?.price);
  if (!Number.isFinite(price)) return null;
  return { price, currency: String(reg.currency || "USD").toUpperCase() };
}

/** Báo giá trước khi trừ tiền Spaceship — premium lấy từ API, TLD thường từ bảng giá hub */
export async function quoteSpaceshipPurchase(domain) {
  const norm = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  if (!norm) throw new Error("Thiếu tên miền");

  const privacyLevel = resolvePrivacyLevel(norm);
  const availability = await checkDomainAvailability(norm).catch(() => ({ result: "unknown" }));

  if (availability.result === "taken") {
    try {
      const owned = await getDomainInfo(norm);
      if (owned?.lifecycleStatus === "registered") {
        return {
          domain: norm,
          canPurchase: true,
          alreadyOwned: true,
          skipCharge: true,
          regUsd: 0,
          privacyUsd: 0,
          privacyLevel,
          totalUsd: 0,
          currency: "USD",
          formattedTotal: "$0.00 USD",
          priceSource: "spaceship_owned",
          message: "Miền đã có trong tài khoản Spaceship — bỏ qua bước mua, chỉ cài CF/LP",
        };
      }
    } catch {}
    return {
      domain: norm,
      canPurchase: false,
      reason: "taken",
      message: "Tên miền đã có chủ — không mua được trên Spaceship",
    };
  }

  if (availability.result !== "available") {
    return {
      domain: norm,
      canPurchase: false,
      reason: availability.result || "unavailable",
      message: `Không thể mua: trạng thái ${availability.result || "unknown"}`,
    };
  }

  const premium = pickRegisterPrice(availability);
  let regUsd;
  let priceSource;

  if (premium) {
    regUsd = premium.price;
    priceSource = "spaceship_api";
  } else {
    const { getPricing } = await import("./wallet.js");
    const pricing = getPricing();
    const tld = norm.includes(".") ? norm.slice(norm.lastIndexOf(".")) : "";
    const tldVal = tld ? pricing.tldPrices?.[tld] : null;
    if (typeof tldVal === "object" && tldVal !== null) {
      regUsd = Number(tldVal.spaceshipReg ?? tldVal.reg);
    } else if (tldVal != null) {
      regUsd = Number(tldVal);
    } else {
      regUsd = Number(pricing.defaultPrice || 4.98);
    }
    if (!Number.isFinite(regUsd)) regUsd = Number(pricing.defaultPrice || 4.98);
    priceSource = "spaceship_catalog";
  }

  const { getPricing } = await import("./wallet.js");
  const pricingCfg = getPricing();
  const privacyUsd =
    privacyLevel === "high" ? Number(pricingCfg.spaceshipPrivacyHighUsd ?? 0) || 0 : 0;
  const totalUsd = Math.round((regUsd + privacyUsd) * 100) / 100;

  return {
    domain: norm,
    canPurchase: true,
    alreadyOwned: false,
    skipCharge: false,
    isPremium: Boolean(premium),
    regUsd,
    privacyLevel,
    privacyUsd,
    privacyLabel: privacyLevel === "high" ? "WHOIS Privacy (high)" : "Public WHOIS (không privacy)",
    totalUsd,
    currency: "USD",
    formattedTotal: `$${totalUsd.toFixed(2)} USD`,
    priceSource,
    years: 1,
    message:
      priceSource === "spaceship_catalog"
        ? "Giá TLD thường lấy từ bảng Spaceship trên hub (API không trả giá trước khi mua)"
        : "Giá premium từ Spaceship API",
  };
}

export async function assertSpaceshipBuyConfirmed(body, domain) {
  if (!body?.isBuy) return null;
  if (!body.spaceshipBuyConfirmed) {
    throw new Error("Chưa xác nhận mua Spaceship — cần popup báo giá trước khi trừ tiền");
  }
  const quote = await quoteSpaceshipPurchase(domain);
  if (!quote.canPurchase) {
    throw new Error(quote.message || `Không thể mua ${domain} trên Spaceship`);
  }
  if (quote.skipCharge) return quote;
  const expected = Number(body.quotedTotalUsd);
  if (!Number.isFinite(expected) || Math.abs(expected - quote.totalUsd) > 0.02) {
    throw new Error(
      `Giá Spaceship đã đổi (${quote.formattedTotal}). Làm mới báo giá và xác nhận lại trước khi mua.`,
    );
  }
  return quote;
}

export async function getDomainInfo(domain) {
  const { data } = await spaceshipRequest(`/v1/domains/${encodeURIComponent(domain)}`);
  return data;
}

export async function listDomains(take = 1, skip = 0) {
  const { data } = await spaceshipRequest(`/v1/domains?take=${take}&skip=${skip}`);
  return data;
}

export async function getAsyncOperation(operationId) {
  const { data } = await spaceshipRequest(`/v1/async-operations/${encodeURIComponent(operationId)}`);
  return data;
}

export async function waitForAsyncOperation(operationId) {
  const { poll } = await import("./utils.js");
  return poll(
    async () => getAsyncOperation(operationId),
    {
      label: `Spaceship async ${operationId}`,
      isDone: (op) => op?.status === "success" || op?.status === "failed",
    },
  ).then((op) => {
    if (op.status === "failed") {
      throw new Error(`Spaceship operation failed: ${JSON.stringify(op.details ?? op)}`);
    }
    return op;
  });
}

export async function registerDomain(domain, contactId) {
  const norm = domain.trim().toLowerCase();
  const privacyLevel = resolvePrivacyLevel(norm);

  // Tự động chuẩn bị Extended Attributes cho tên miền đuôi .US
  let contactAttributes = [];
  if (norm.endsWith(".us")) {
    try {
      const { data: attrData } = await spaceshipRequest("/v1/contacts/attributes", {
        method: "PUT",
        body: {
          contact: contactId,
          type: "us",
          nexusCategory: "C31",
          appPurpose: "P1",
          nexusCountry: "VN",
        },
      });
      const attrId = attrData?.contactId || contactId;
      if (attrId) {
        contactAttributes = [attrId];
      }
    } catch (attrErr) {
      console.warn("Cảnh báo tạo US Nexus attributes:", attrErr.message);
    }
  }

  const createBody = () => {
    const b = {
      autoRenew: false,
      years: 1,
      contacts: {
        registrant: contactId,
        admin: contactId,
        tech: contactId,
        billing: contactId,
      },
      privacyProtection: {
        level: privacyLevel,
        userConsent: true,
      },
    };
    if (contactAttributes.length > 0) {
      b.contacts.attributes = contactAttributes;
    }
    return b;
  };

  const reqBody = createBody();

  try {
    const { response, asyncId } = await spaceshipRequest(
      `/v1/domains/${encodeURIComponent(domain)}`,
      { method: "POST", body: reqBody },
    );

    if (response.status === 202 && asyncId) {
      await waitForAsyncOperation(asyncId);
      return { purchased: true, async: true };
    }

    return { purchased: true, async: false };
  } catch (err) {
    const msg = (err.message || "").toLowerCase();
    if (
      msg.includes("already registered") ||
      msg.includes("not available for registration") ||
      msg.includes("already exists") ||
      msg.includes("already owned")
    ) {
      // Kiểm tra nếu tên miền đã thuộc tài khoản Spaceship của bạn
      try {
        const info = await getDomainInfo(domain);
        if (info && !info.error) {
          console.log(`ℹ️ Tên miền [${domain}] đã có sẵn trong tài khoản Spaceship. Tiếp tục bước cấu hình.`);
          return { purchased: true, alreadyRegistered: true };
        }
      } catch {}
      console.log(`ℹ️ Tên miền [${domain}] đã được đăng ký trước đó. Bỏ qua bước mua và tiếp tục bước cấu hình.`);
      return { purchased: true, alreadyRegistered: true };
    }
    throw err;
  }
}

export async function updateNameservers(domain, hosts) {
  const body = {
    provider: "custom",
    hosts,
  };

  const { response, asyncId } = await spaceshipRequest(
    `/v1/domains/${encodeURIComponent(domain)}/nameservers`,
    { method: "PUT", body },
  );

  if (response.status === 202 && asyncId) {
    await waitForAsyncOperation(asyncId);
  }

  return { updated: true, hosts };
}

export async function resolveContactId(explicitContactId) {
  if (explicitContactId) return explicitContactId;

  const fromEnv = config.spaceship.contactId();
  if (fromEnv) return fromEnv;

  const list = await listDomains(1, 0);
  const first = list?.items?.[0];
  const contactId = first?.contacts?.registrant;
  if (!contactId) {
    throw new Error(
      "Không tìm thấy SPACESHIP_CONTACT_ID. Chạy: node bin/cli.js contacts",
    );
  }
  return contactId;
}
