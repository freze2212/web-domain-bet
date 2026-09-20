import { Client } from "ssh2";

const remote = `
from pathlib import Path
p = Path('/var/www/media-vault/public/style.css')
css = p.read_text(encoding='utf-8')
old = '''.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.media-card {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}
.media-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-glow);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
}
.media-preview-box {
  width: 100%;
  height: 160px;
  background: #000;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.media-preview-box video, .media-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.media-card:hover .media-preview-box video, 
.media-card:hover .media-preview-box img {
  transform: scale(1.04);
}'''
new = '''.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.media-card {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}
.media-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-glow);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.media-preview-box {
  width: 100%;
  height: auto;
  min-height: 72px;
  max-height: 120px;
  background: #0b1220;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 6px;
}
.media-preview-box video, .media-preview-box img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 108px;
  object-fit: contain;
  object-position: center;
  transition: none;
}
.media-card:hover .media-preview-box video, 
.media-card:hover .media-preview-box img {
  transform: none;
}'''
if old not in css:
  raise SystemExit('OLD_BLOCK_NOT_FOUND')
p.write_text(css.replace(old, new, 1), encoding='utf-8')
print('OK patched style.css')
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_patch_media_css.py && python3 /tmp/_patch_media_css.py`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", (code) => {
      console.log(o);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
