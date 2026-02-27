
// import { addToTorrent } from "./addTOTorrent.js";
import { delay } from "./delay.js";
import { cleanupTodayTorrents,moveTodayShowsToTV } from "./qbittorrent/torrentCleanUp.js";
import { loginQB } from "./qbittorrent/qb.js";
import { triggerHomeAssistantWebhook ,triggerHAWebhookWhenErrorOccurs } from "./homeassitant/homeAssistantWebhook.js";
import { log } from "./timelog.js";
import { publishMessage } from "./queue/publishMessage.js";
import { retry } from "./homeassitant/RetryWrapper.js";



async function main() {
  try {
    
    console.log("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
    await publishMessage({
  message: "🥑🥑🥑🥑🥑🥑🥑🥑🥑"
});
    console.log("🚀 torrent cleaning process started");
    await publishMessage({
  message: "🚀 torrent cleaning process started"
});
    await log();

    await loginQB()
    await delay(2000,true)

    await cleanupTodayTorrents();
    await delay(2000,true)

    await moveTodayShowsToTV();

    console.log("torrent cleaning process completed successfully 🎉");
       await publishMessage({
  message: "torrent cleaning process completed successfully 🎉"
});
   await delay(1000,true);

 await retry (triggerHomeAssistantWebhook)



    console.log("🥑🥑🥑🥑🥑🥑🥑🥑🥑")
        await publishMessage({
  message: "🥑🥑🥑🥑🥑🥑🥑🥑🥑"
});
  } catch (error) {
    console.error("Fatal error in main():");
    console.error(error);
            await publishMessage({
  message: "❌ Fatal error in main():"
});
     await retry (triggerHAWebhookWhenErrorOccurs)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });