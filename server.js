
import { addToTorrent } from "./addTOTorrent.js";
import { delay } from "./delay.js";
import { sendMessage } from "./telegram/sendTelegramMessage.js";
import { cleanupTodayTorrents } from "./qbittorrent/torrentCleanUp.js";

async function main() {
  try {
    await sendMessage("------------------------")
    console.log("------------------------")
    console.log("🚀 torrent cleaning process started");
    await sendMessage('🚀 torrent cleaning process started');

    await cleanupTodayTorrents();
 
    console.log("torrent cleaning process completed successfully 🎉");
    await sendMessage("torrent cleaning process completed successfully 🎉")
    await sendMessage("------------------------")
    console.log("------------------------")
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