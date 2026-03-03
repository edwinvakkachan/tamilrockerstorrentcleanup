import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";


async function renameFilesForTorrents(torrents) {
  for (const torrent of torrents) {

    // Get files inside torrent
    const { data: files } = await qb.get(
      "/api/v2/torrents/files",
      { params: { hash: torrent.hash } }
    );

    for (const file of files) {

      const cleanedName = file.name.replace(
        /^www\.1TamilMV\.gs\s*-\s*/i,
        ""
      );

      if (cleanedName !== file.name) {
        await qb.post(
  "/api/v2/torrents/rename",
  new URLSearchParams({
    hash: torrent.hash,
    name: cleanedName
  })
);

        console.log(`Renamed: ${file.name} → ${cleanedName}`);
      }
    }
  }
}


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

  const isMalayalam =
    /\bmalayalam\b/i.test(name) ||
    /\bmal\b/i.test(name);

  const isPreDVD = /\bpredvd\b/i.test(name);

  return isMalayalam && isPreDVD;
});

// await renameFilesForTorrents(showTorrents); 

  if (!showTorrents.length) {
    console.log("👍 No Predvd shows found for today");

        await publishMessage({
      message: "👍 No Predvd shows found for today"
    });
    return;
  }

  const hashes = showTorrents.map(t => t.hash).join("|");
  
  // added a tag called pre dvd
  await qb.post(
  "/api/v2/torrents/addTags",
  new URLSearchParams({
    hashes,
    tags: "predvd"
  })
);

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
