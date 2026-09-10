import fs from "fs";
import path from "path";

const hosts = [
  ["5f-gg88", "https://landingpage-5f-gg88.pages.dev"],
  ["5f-llwin", "https://landingpage-5f-llwin.pages.dev"],
  ["5f-g-admin", "https://landingpage-5f-g.pages.dev"],
];

const outDir = "data/_tpl_snip";
fs.mkdirSync(outDir, { recursive: true });

function count(html, re) {
  return (html.match(re) || []).length;
}

function abs(base, u) {
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
}

for (const [name, url] of hosts) {
  const html = await (await fetch(url)).text();
  fs.writeFileSync(path.join(outDir, `${name}.html`), html);
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
  const imgs = [...html.matchAll(/src=["']([^"']+\.(?:png|svg|webp|jpe?g))["']/gi)].map((m) =>
    abs(url, m[1])
  );
  const logoish = imgs.filter((u) => /logo|brand|llwin|gg88|favicon/i.test(u));
  const counts = {
    GG88: count(html, /GG88/gi),
    LLWIN: count(html, /LLWIN|llwin/gi),
    Singapore: count(html, /Singapore/gi),
    Philippines: count(html, /Philippines/gi),
  };
  console.log("\n====", name, url);
  console.log("title:", title);
  console.log("counts:", counts);
  console.log("logoish:", logoish.slice(0, 12));
  console.log("imgs:", imgs.slice(0, 12));

  // download first few images for visual compare
  let i = 0;
  for (const img of [...logoish, ...imgs].slice(0, 8)) {
    try {
      const r = await fetch(img);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = (img.split(".").pop() || "bin").split("?")[0].slice(0, 5);
      const fp = path.join(outDir, `${name}-img${i}.${ext}`);
      fs.writeFileSync(fp, buf);
      console.log("saved", fp, buf.length);
      i++;
    } catch (e) {
      console.log("img fail", img, e.message);
    }
  }
}

const locals = [
  ["local-gg88-5f", "C:\\Landingpages\\GG88\\landing-page-5f"],
  ["local-llwin-5f", "C:\\Landingpages\\LLWIN\\landing-page-5f"],
];
for (const [label, dir] of locals) {
  console.log("\nLOCAL", label, dir, "exists=", fs.existsSync(dir));
  if (!fs.existsSync(dir)) continue;
  const walk = (d, depth = 0, acc = []) => {
    if (depth > 4) return acc;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.name === "node_modules" || f.name === ".git") continue;
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full, depth + 1, acc);
      else if (/\.(png|svg|webp|jpe?g)$/i.test(f.name) && /logo|llwin|gg88|brand/i.test(f.name))
        acc.push(full);
    }
    return acc;
  };
  const logos = walk(dir);
  console.log("logo files:", logos);
  // copy a few
  logos.slice(0, 4).forEach((f, idx) => {
    const dest = path.join(outDir, `${label}-logo${idx}${path.extname(f)}`);
    fs.copyFileSync(f, dest);
    console.log("copied", dest);
  });
  // index/html brand sniff
  for (const cand of ["index.html", "index.htm"]) {
    const p = path.join(dir, cand);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, "utf8");
    console.log(cand, {
      GG88: count(html, /GG88/gi),
      LLWIN: count(html, /LLWIN|llwin/gi),
      Singapore: count(html, /Singapore/gi),
    });
  }
}
