/** Build Namecheap-style TLD suggestions for an SLD */
export const SUGGEST_TLDS = [
  ".com", ".net", ".top", ".xyz", ".vip", ".live", ".site",
  ".online", ".shop", ".fun", ".club", ".cc", ".pw", ".pro", ".win", ".icu",
];

export function extractSld(domain) {
  const clean = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/\.$/, "");
  if (!clean) return "";
  const i = clean.lastIndexOf(".");
  if (i <= 0) return clean.replace(/[^a-z0-9-]/g, "");
  return clean.slice(0, i).replace(/[^a-z0-9-]/g, "");
}

export function buildSuggestCandidates(seedDomain, { excludeSeed = true, limit = 16 } = {}) {
  const sld = extractSld(seedDomain);
  if (!sld || sld.length < 2) return [];
  const seed = String(seedDomain || "").trim().toLowerCase().replace(/^www\./, "");
  const out = [];
  const seen = new Set();
  for (const tld of SUGGEST_TLDS) {
    const d = `${sld}${tld}`;
    if (excludeSeed && d === seed) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}
