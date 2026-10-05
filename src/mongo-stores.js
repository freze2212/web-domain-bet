import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

const OBJECT_STORES = new Set(["wallets", "pricing", "bank_config"]);

let db = null;
let queue = Promise.resolve();
const mem = {};

function readJson(name, fallback) {
  const file = path.join(dataDir, name);
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8") || "");
  } catch {
    return fallback;
  }
}

function cleanDoc(doc) {
  const copy = JSON.parse(JSON.stringify(doc));
  delete copy._id;
  return copy;
}

function docsFromValue(name, value) {
  if (name === "domains") {
    const map = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.values(map).map((item, ord) => ({ ...item, ord }));
  }
  if (OBJECT_STORES.has(name)) {
    return [{ data: value }];
  }
  const list = Array.isArray(value) ? value : [];
  return list.map((item, ord) => ({ ...item, ord }));
}

function valueFromDocs(name, docs) {
  const clean = docs.map(cleanDoc);
  if (name === "domains") {
    const map = {};
    clean.sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
    for (const item of clean) {
      const key = String(item.domain || "").trim().toLowerCase();
      delete item.ord;
      if (key) map[key] = item;
    }
    return map;
  }
  if (OBJECT_STORES.has(name)) {
    return clean[0]?.data ?? null;
  }
  return clean
    .sort((a, b) => {
      if (a.ord != null || b.ord != null) return (a.ord ?? 0) - (b.ord ?? 0);
      return String(b.timestamp || "").localeCompare(String(a.timestamp || ""));
    })
    .map((item) => {
      delete item.ord;
      return item;
    });
}

async function writePayload(name, value) {
  const col = db.collection(name);
  await col.deleteMany({});
  await col.insertOne({ payload: JSON.stringify(value ?? null) });
}

async function readPayload(name) {
  const docs = await db.collection(name).find({}).toArray();
  if (!docs.length) return { found: false, value: null, count: 0 };
  if (docs.length === 1 && typeof docs[0].payload === "string") {
    const value = JSON.parse(docs[0].payload);
    return { found: true, value, count: countOf(name, value) };
  }
  const value = valueFromDocs(name, docs);
  return { found: true, value, count: countOf(name, value) };
}

function countOf(name, value) {
  if (Array.isArray(value)) return value.length;
  if (name === "domains" && value && typeof value === "object") return Object.keys(value).length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value == null ? 0 : 1;
}

export function mongoEnabled() {
  return !!db;
}

export function getStore(name) {
  return mem[name];
}

const pendingWrites = new Set();

/** Gộp ghi: nhiều lần set liên tiếp cùng store chỉ ghi 1 lần với bản mới nhất (history ~MB/lần ghi). */
export function setStore(name, value) {
  mem[name] = value;
  if (!db || pendingWrites.has(name)) return;
  pendingWrites.add(name);
  queue = queue
    .then(async () => {
      pendingWrites.delete(name);
      let payload;
      try {
        payload = JSON.stringify(mem[name] ?? null);
      } catch (err) {
        console.error(`[mongo] ${name} không serialize:`, err.message);
        return;
      }
      const col = db.collection(name);
      await col.deleteMany({});
      await col.insertOne({ payload });
    })
    .catch((err) => {
      console.error(`[mongo] ghi ${name} lỗi:`, err.message);
    });
}

export async function initMongoStores() {
  const uri = process.env.MONGODB_URI?.trim() || "";
  if (!uri || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
    throw new Error("MONGODB_URI không hợp lệ");
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db();
  await db.command({ ping: 1 });
  await db.collection("domains").createIndex({ domain: 1 });
  await db.collection("history").createIndex({ domain: 1 });
  await db.collection("history").createIndex({ timestamp: -1 });
  await db.collection("domain_orders").createIndex({ domain: 1 });
  await db.collection("domain_requests").createIndex({ domain: 1 });
  await db.collection("users").createIndex({ username: 1 });
}

const SEEDS = [
  ["history", "history.json", []],
  ["domains", "domain_ownership.json", {}],
  ["domain_orders", "domain_orders.json", []],
  ["domain_requests", "domain_requests.json", []],
  ["users", "users.json", []],
  ["wallets", "wallets.json", {}],
  ["transactions", "transactions.json", []],
  ["pricing", "pricing.json", null],
  ["bank_config", "bank_config.json", null],
];

function seedHasRows(name, value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export async function loadAllStores() {
  if (!db) throw new Error("Mongo chưa kết nối");
  const counts = {};
  for (const [name, file, fallback] of SEEDS) {
    const loaded = await readPayload(name);
    if (loaded.found) {
      mem[name] = loaded.value;
      counts[name] = loaded.count;
      console.log(`[mongo] ${name} ${counts[name]}`);
      continue;
    }
    const fromFile = file ? readJson(file, fallback) : fallback;
    const value = seedHasRows(name, fromFile) ? fromFile : fallback;
    mem[name] = value;
    if (seedHasRows(name, value)) {
      await writePayload(name, value);
      counts[name] = countOf(name, value);
      console.log(`[mongo] ${name} nạp lần đầu ${counts[name]}`);
    } else {
      counts[name] = 0;
      console.log(`[mongo] ${name} 0`);
    }
  }
  return counts;
}
