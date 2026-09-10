import { execSync } from "node:child_process";

try {
  const output = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
  const lines = output.trim().split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0' && pid !== String(process.pid)) {
      console.log(`Killing PID ${pid}...`);
      try {
        execSync(`taskkill /F /PID ${pid}`);
      } catch {}
    }
  }
} catch (e) {
  console.log("No process on port 3000 or error:", e.message);
}
