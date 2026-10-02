
import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";
import { delay } from "../delay.js";


export async function moveTodayShowsToTV() {
  const today = new Date().toISOString().split("T")[0];

  // Get torrents filtered by today's tag.
  const { data: torrents } = await qb.get("/api/v2/torrents/info", {
    params: {
      tag: today
    }
  });

  if (!torrents.length) {
    console.log("No TV show torrents found for today");
    await publishMessage({
      message: "No TV show torrents found for today"
    });
    return;
  }

  const showTorrents = torrents.filter(t => {
    const name = t.name;

    return (
      // Standard S01E05
      /\bS\d{1,2}\s?E\d{1,2}\b/i.test(name) ||

      // S01 EP 05 / S01 EP (01-10)
      /\bS\d{1,2}\s?EP\b/i.test(name) ||

      // Just Season 1
      /\bSeason\s?\d{1,2}\b/i.test(name) ||

      // 1x05 format
      /\b\d{1,2}x\d{1,2}\b/i.test(name) ||

      // Episode 05
      /\bEpisode\s?\d{1,3}\b/i.test(name) ||

      // EP05 / E05 standalone
      /\bEP?\s?\d{1,3}\b/i.test(name) ||

      // Complete Season Pack
      /\bComplete\sSeason\b/i.test(name) ||

      // S01 (01-10)
      /\bS\d{1,2}\s?\(\d+/i.test(name) ||

      // Multi episode indicators
      /\bMulti\s?Episode\b/i.test(name) ||

      // Volume based shows
      /\bVol\s?\d+/i.test(name)
    );
  });

  if (!showTorrents.length) {
    console.log("No shows found for today");
    await publishMessage({
      message: "No shows found for today"
    });
    return;
  }

  const hashes = showTorrents.map(t => t.hash).join("|");

  await qb.post(
    "/api/v2/torrents/setCategory",
    new URLSearchParams({
      hashes,
      category: "Qbit2tbTV"
    })
  );

  await publishMessage({
    message: `Moved ${showTorrents.length} shows to Qbit2tbTV`
  });
  console.log(`Moved ${showTorrents.length} shows to Qbit2tbTV`);
}