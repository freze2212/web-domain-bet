import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

function remoteOf(p) {
  try {
    if (!fs.existsSync(path.join(p, ".git"))) return null;
    return execSync("git remote get-url origin", { cwd: p, encoding: "utf8" })
      .trim()
      .replace(/\.git$/i, "")
      .replace(/^https?:\/\/[^@]+@github\.com\//i, "")
      .replace(/^https?:\/\/github\.com\//i, "");
  } catch {
    return null;
  }
}

for (const t of ACTIVE_TEMPLATES) {
  const remote = remoteOf(t.path);
  const field = t.gitRepo || null;
  if (!field && !remote) {
    console.log("NO_REPO", t.id);
    continue;
  }
  if (field && remote && field !== remote) {
    console.log("MISMATCH", t.id, "field=", field, "local=", remote);
  } else if (!field && remote) {
    console.log("FIELD_MISSING", t.id, "local=", remote);
  }
}
