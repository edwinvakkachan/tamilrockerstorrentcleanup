
// import { addToTorrent } from "./addTOTorrent.js";
import { delay } from "./delay.js";
import { sendMessage } from "./telegram/sendTelegramMessage.js";
import { cleanupTodayTorrents,moveTodayShowsToTV } from "./qbittorrent/torrentCleanUp.js";
import { loginQB } from "./qbittorrent/qb.js";
import { triggerHomeAssistantWebhook } from "./homeassitant/homeAssistantWebhook.js";

async function main() {
  try {
    await sendMessage("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
    console.log("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
    console.log("🚀 torrent cleaning process started");
    await sendMessage('🚀 torrent cleaning process started');

    await loginQB()
    await delay(2000,true)

    await cleanupTodayTorrents();
    await delay(2000,true)

    await moveTodayShowsToTV();

    console.log("torrent cleaning process completed successfully 🎉");
    await sendMessage("torrent cleaning process completed successfully 🎉")
    await triggerHomeAssistantWebhook({
  status: "success",
  message: "Torrent cleaning completed",
  time: new Date().toISOString(),
});
    await sendMessage("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
    console.log("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
  } catch (error) {
    console.error("Fatal error in main():");
    console.error(error);
    await sendMessage("❌ Fatal error in main():")
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });