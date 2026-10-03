import { delay } from "./delay.js";
import { cleanupTodayTorrents } from "./qbittorrent/torrentCleanUp.js";
import { loginQB } from "./qbittorrent/qb.js";
import {
  triggerHomeAssistantWebhook,
  triggerHomeAssistantWebhookWhenErrorOccurs
} from "./homeassitant/homeAssistantWebhook.js";
import { log } from "./timelog.js";
import { publishMessage } from "./queue/publishMessage.js";
import { retry } from "./homeassitant/RetryWrapper.js";
import { selectPredvd } from "./qbittorrent/predvd.js";
import { moveTodayShowsToTV } from "./qbittorrent/moveTodayShowsToTV.js";

async function main() {
  try {
    await log();

    console.log("Torrent cleaning process started");
    await publishMessage({
      message: "Torrent cleaning process started"
    });

    await loginQB();
    await delay(2000, true);
    await selectPredvd();

    await delay(5000, true);

let result = false;

while (!result) {

  console.log("🚀 Starting torrent cleanup...");

  result = await cleanupTodayTorrents();

  if (!result) {
    console.log(
      "⏳ Some torrents still have incomplete metadata. Retrying in 30 seconds..."
    );

    await new Promise(resolve =>
      setTimeout(resolve, 30 * 1000)
    );
  }
}

console.log("✅ Torrent cleanup completed. All metadata is ready.");

    await delay(2000, true);

    await moveTodayShowsToTV();

    console.log("Torrent cleaning process completed successfully");
    await publishMessage({
      message: "Torrent cleaning process completed successfully"
    });
    await delay(1000, true);

    await retry(
      triggerHomeAssistantWebhook,
      { status: "success" },
      "homeassistant-success",
      5
    );

    console.log("Cleanup workflow finished");
    await publishMessage({
      message: "Cleanup workflow finished"
    });
  } catch (error) {
    console.error("Fatal error in main():");
    console.error(error);
    await publishMessage({
      message: "Fatal error in main():"
    });
    await retry(
      triggerHomeAssistantWebhookWhenErrorOccurs,
      { status: "error" },
      "homeassistant-error",
      5
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
