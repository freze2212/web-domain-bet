import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const searchRoots = [
  "C:\\Landingpage",
  "C:\\GG88",
  "C:\\LLWIN",
  "C:\\MM88",
  "C:\\RR88",
  "C:\\XX88",
  "C:\\ALO8",
  "C:\\KJC",
  "C:\\Slot",
  "C:\\FREZE-PRJ",
  "C:\\App bcr",
  "C:\\APP BCR XX88 KHU C",
  "C:\\App Tool Andr",
];

const found = [];

function cleanTitle(raw) {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scan(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    const hasIndexHtml = fs.existsSync(path.join(dir, "index.html"));
    const hasDomainsJson = fs.existsSync(path.join(dir, "domains.json"));

    if (hasIndexHtml) {
      let title = "";
      try {
        const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m) title = cleanTitle(m[1]);
      } catch {}

      let sampleDomain = "";
      let allDomains = [];
      if (hasDomainsJson) {
        try {
          const dj = JSON.parse(
            fs.readFileSync(path.join(dir, "domains.json"), "utf8"),
          );
          if (Array.isArray(dj)) {
            allDomains = dj
              .map((d) => (typeof d === "string" ? d : d.domain))
              .filter(Boolean);
          } else if (typeof dj === "object" && dj !== null) {
            allDomains = Object.keys(dj).filter(
              (k) =>
                k !== "_default" &&
                !k.startsWith("http") &&
                k.includes(".") &&
                !k.includes("/"),
            );
          }
          if (allDomains.length > 0) {
            sampleDomain = allDomains[0];
          }
        } catch {}
      }

      let remoteUrl = "";
      let pagesDev = "";
      try {
        const gitConfig = path.join(dir, ".git", "config");
        if (fs.existsSync(gitConfig)) {
          const conf = fs.readFileSync(gitConfig, "utf8");
          const m = conf.match(/url\s*=\s*.*github\.com[:/]([^\s/]+)\/([^\s.]+)/i);
          if (m) {
            remoteUrl = `https://github.com/${m[1]}/${m[2]}`;
            pagesDev = `${m[2].toLowerCase()}.pages.dev`;
          }
        }
      } catch {}

      let finalLink = "";
      if (sampleDomain) {
        finalLink = `https://${sampleDomain}`;
      } else if (pagesDev) {
        finalLink = `https://${pagesDev}`;
      }

      const folderName = path.basename(dir);
      if (
        folderName !== "node_modules" &&
        folderName !== ".git" &&
        folderName !== "dist" &&
        folderName !== "build" &&
        folderName !== "out" &&
        folderName !== "webpack"
      ) {
        found.push({
          folder: folderName,
          path: dir,
          title: title || folderName,
          sampleDomain,
          pagesDev,
          finalLink,
          totalDomains: allDomains.length,
          remoteUrl,
        });
      }
    }

    for (const ent of entries) {
      if (
        ent.isDirectory() &&
        ent.name !== "node_modules" &&
        ent.name !== ".git" &&
        ent.name !== "dist" &&
        ent.name !== "build" &&
        ent.name !== "out" &&
        ent.name !== "webpack" &&
        ent.name !== ".next"
      ) {
        scan(path.join(dir, ent.name), depth + 1);
      }
    }
  } catch {}
}

for (const r of searchRoots) {
  if (fs.existsSync(r)) scan(r, 0);
}

const unique = [];
const seen = new Set();
for (const f of found) {
  if (!seen.has(f.path)) {
    seen.add(f.path);
    unique.push(f);
  }
}

console.log(JSON.stringify(unique, null, 2));
