import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";



export async function selectPredvd() {
  const today = new Date().toISOString().split("T")[0];

  // 1️⃣ Get torrents filtered by tag
  const { data: torrents } = await qb.get("/api/v2/torrents/info", {
    params: {
      tag: today
    }
  });
  if (!torrents.length) {
    console.log("👍 No  torrents found for today");

        await publishMessage({
      message: "👍 No torrents found for today"
    });
    return;
  }

  // 2️⃣ Identify predvd
  const showTorrents = torrents.filter(t => {
  const name = t.name.toLowerCase();

  return (
    /\bmalayalam\b/i.test(name) && /\bpredvd\b/i.test(name)  ||

    /\b\mal\b/i.test(name) && /\bpredvd\b/i.test(name)
  );
});



  if (!showTorrents.length) {
    console.log("👍 No Predvd shows found for today");

        await publishMessage({
      message: "👍 No Predvd shows found for today"
    });
    return;
  }

  const hashes = showTorrents.map(t => t.hash).join("|");

  // 3️⃣ Change category
  await qb.post(
    "/api/v2/torrents/setCategory",
    new URLSearchParams({
      hashes,
      category: "2tbPreDVD"
    })
  );
      await publishMessage({
      message: `🔔 Moved ${showTorrents.length} PreDVD to 2tbPreDVD`
    });
  console.log(`🔔 Moved ${showTorrents.length} PreDVD to 2tbPreDVD`);
}
