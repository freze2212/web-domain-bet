import { execSync } from "node:child_process";
import fs from "node:fs";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outFile = "C:\\FREZE-PRJ\\web-tên-miền\\screenshots\\landingpage_mm88.png";
const url = "file:///C:/MM88/landing-page/index.html";

try {
  execSync(`"${chrome}" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --screenshot="${outFile}" "${url}"`, { stdio: "ignore" });
  if (fs.existsSync(outFile)) {
    console.log("SUCCESS, size:", fs.statSync(outFile).size);
  }
} catch (e) {
  console.error("Error:", e.message);
}
