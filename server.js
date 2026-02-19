
import { addToTorrent } from "./addTOTorrent.js";
import { delay } from "./delay.js";
import { sendMessage } from "./telegram/sendTelegramMessage.js";
import { cleanupTodayTorrents } from "./qbittorrent/torrentCleanUp.js";

async function main() {
  try {
    console.log("torrent adding from db has been started");
    // await sendMessage("torrent adding from db has been started")

    await addToTorrent();
    await delay(5000);
    await cleanupTodayTorrents();
    console.log("torrent adding from db has been  completed successfully");
    // await sendMessage("torrent adding from db has been  completed successfully")
  } catch (error) {
    console.error("Fatal error in main():");
    console.error(error);
    // await sendMessage(error)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });