from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
text = p.read_text(encoding="utf-8")

# 1) While waiting blank iframe, retry Chơi ngay every 3 tries
old_wait = """    console.log(
      `[HALL] chờ sảnh load ${srcTry + 1}/${tries} (iframe còn blank — không click play lại)`
    );
    await dismissBrowserSupportModal().catch(() => {});
    await helper.delay(1200);"""

new_wait = """    console.log(
      `[HALL] chờ sảnh load ${srcTry + 1}/${tries} (iframe blank)`
    );
    await dismissBrowserSupportModal().catch(() => {});
    if ((srcTry + 1) % 3 === 0) {
      console.log("[HALL] iframe blank — click Chơi ngay lại");
      await clickSexyPlayButton().catch(() => {});
    }
    await helper.delay(1200);"""

if old_wait not in text:
    raise SystemExit("waitSeamless blank block not found")
text = text.replace(old_wait, new_wait, 1)
print("OK: retry play on blank iframe")

# 2) Keepalive: 1 soft recover fail → hard reset (hall thật sự chết), cooldown 3 phút
old_soft = """        if (staleMs >= 45000 && staleMs < 300000) {
          console.log(
            "[HALL KEEPALIVE] soft recover lobby stale=" +
              Math.round(staleMs / 1000) +
              "s"
          );
          lastSessionProgressAt = Date.now();
          await recoverHallViaLiveLobby().catch((e) =>
            console.log("[HALL KEEPALIVE] soft recover err=" + e.message)
          );
          await waitSeamlessSrcOrHall(12).catch(() => {});
          await bindSeamlessFrame().catch(() => {});
          gameHallFrame = await waitForGameHall(3).catch(() => null);
          await pollHallFromBrowserAndIngest();
          return;
        }

        if (staleMs >= 300000) {
          console.log(
            "[HALL KEEPALIVE] hard resetMain — hall stale " +
              Math.round(staleMs / 1000) +
              "s"
          );
          lastSessionProgressAt = Date.now();
          await resetMain().catch((e) =>
            console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
          );
        }"""

new_soft = """        if (staleMs >= 45000) {
          const lastHard = Number(globalThis.__hallHardResetAt || 0);
          const sinceHard = Date.now() - lastHard;
          const hall = await resolveGameHallFrame().catch(() => null);
          if (hall) gameHallFrame = hall;
          const ok2 = await pollHallFromBrowserAndIngest();
          if (ok2) {
            lastSessionProgressAt = Date.now();
            return;
          }
          // Soft 1 lần: về /live + Chơi ngay
          if (!globalThis.__hallSoftTried || Date.now() - globalThis.__hallSoftTried > 120000) {
            globalThis.__hallSoftTried = Date.now();
            console.log(
              "[HALL KEEPALIVE] soft recover lobby stale=" +
                Math.round(staleMs / 1000) +
                "s"
            );
            lastSessionProgressAt = Date.now();
            await recoverHallViaLiveLobby().catch((e) =>
              console.log("[HALL KEEPALIVE] soft recover err=" + e.message)
            );
            await waitSeamlessSrcOrHall(8).catch(() => {});
            await bindSeamlessFrame().catch(() => {});
            gameHallFrame = await waitForGameHall(3).catch(() => null);
            const ok3 = await pollHallFromBrowserAndIngest();
            if (ok3) {
              globalThis.__hallSoftTried = 0;
              lastSessionProgressAt = Date.now();
              return;
            }
          }
          // Soft fail / sảnh blank / logout → login lại. Cooldown 3 phút tránh spam.
          if (sinceHard < 180000) {
            console.log(
              "[HALL KEEPALIVE] hall chết, chờ cooldown reset " +
                Math.round((180000 - sinceHard) / 1000) +
                "s"
            );
            lastSessionProgressAt = Date.now();
            return;
          }
          globalThis.__hallHardResetAt = Date.now();
          console.log(
            "[HALL KEEPALIVE] hard resetMain — hall stale " +
              Math.round(staleMs / 1000) +
              "s (soft fail)"
          );
          lastSessionProgressAt = Date.now();
          await resetMain().catch((e) =>
            console.log("[HALL KEEPALIVE] resetMain err=" + e.message)
          );
        }"""

if old_soft not in text:
    raise SystemExit("keepalive soft/hard block not found")
text = text.replace(old_soft, new_soft, 1)
print("OK: recover then hard reset with 3m cooldown")

p.write_text(text, encoding="utf-8")
print("WROTE")
