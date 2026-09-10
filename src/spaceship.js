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
  const noPrivacyTlds = [".uk", ".co.uk", ".me.uk", ".org.uk", ".us", ".in", ".ca", ".de", ".nl", ".eu"];
  const isNoPrivacy = noPrivacyTlds.some((tld) => norm.endsWith(tld));

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

  const createBody = (usePrivacy) => {
    const b = {
      autoRenew: false,
      years: 1,
      contacts: {
        registrant: contactId,
        admin: contactId,
        tech: contactId,
        billing: contactId,
      },
    };
    if (contactAttributes.length > 0) {
      b.contacts.attributes = contactAttributes;
    }
    if (usePrivacy) {
      b.privacyProtection = {
        level: "high",
        userConsent: true,
      };
    } else {
      b.privacyProtection = {
        level: "public",
        userConsent: true,
      };
    }
    return b;
  };

  const reqBody = createBody(!isNoPrivacy);

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
