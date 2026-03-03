import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";
import { delay } from "../delay.js";
const TWO_GB = 2 * 1024 * 1024 * 1024;

function getTodayTag() {
  return new Date().toISOString().split("T")[0];
}



export async function getTorrentsByTag(tag) {
  const { data } = await qb.get("/api/v2/torrents/info", {
    params: { tag }
  });
  await delay(3000,true)
  return data;
}

export async function deleteTorrents(hashes) {
  if (!hashes.length) return;

  await qb.post(
    "/api/v2/torrents/delete",
    new URLSearchParams({
      hashes: hashes.join("|"),
      deleteFiles: "true"
    })
  );
}




function extractMovieKey(name) {
  const match = name.match(/-\s*(.+?\(\d{4}\))/);

  if (match) {
    return match[1].trim().toLowerCase();
  }

  // fallback if pattern fails
  return name
    .replace(/\b(2160p|1080p|720p|480p|x265|x264|HEVC|HDRip|WEB-DL|AAC|DD5\.1)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}




function selectBestTorrent(torrents) {

  const TWO_GB = 2 * 1024 * 1024 * 1024;

  function isPreDVD(name) {
    return /\bpredvd\b/i.test(name);
  }

  function detectLanguagePriority(name) {
    const lower = name.toLowerCase();

    const hasMalayalam = /\b(malayalam|mal)\b/i.test(lower);
    const hasHindi = /\b(hindi|hin)\b/i.test(lower);
    const hasTamil = /\b(tamil|tam)\b/i.test(lower);

    if (hasMalayalam) return 3;
    if (hasHindi) return 2;
    if (hasTamil) return 1;

    return 0;
  }

  function sortByLanguageAndSize(list) {
    return [...list].sort((a, b) => {

      // 1️⃣ Prefer NON-PreDVD
      const aPre = isPreDVD(a.name);
      const bPre = isPreDVD(b.name);

      if (aPre !== bPre) {
        return aPre ? 1 : -1;
      }

      // 2️⃣ Language priority
      const langDiff =
        detectLanguagePriority(b.name) -
        detectLanguagePriority(a.name);

      if (langDiff !== 0) return langDiff;

      // 3️⃣ Larger size wins
      return b.size - a.size;
    });
  }

  // 1️⃣ Prefer 1080p under 2GB
  const candidates = torrents.filter(t =>
    /1080p/i.test(t.name) && t.size < TWO_GB
  );

  if (candidates.length > 0) {
    return sortByLanguageAndSize(candidates)[0];
  }

  // 2️⃣ Fallback: any under 2GB
  const under2gb = torrents.filter(t => t.size < TWO_GB);

  if (under2gb.length > 0) {
    return sortByLanguageAndSize(under2gb)[0];
  }

  // 3️⃣ Final fallback
  return sortByLanguageAndSize(torrents)[0];
}

export async function cleanupTodayTorrents() {
  // const tag = getTodayTag();
  const tag = 'script';
 
      await publishMessage({
      message: `The searching tag in QB is ${tag}`
    });
  console.log(`The searching tag in QB is ${tag}`)

  const torrents = await getTorrentsByTag(tag);

  await delay(2000,true);

  if (!torrents.length) {
    console.log("🚨 No torrents found for today.");
        await publishMessage({
      message: "🚨 No torrents found for today."
    });
    return;
  }

  // 🔥 Step 1 — Group by movie
  const grouped = {};

  for (const torrent of torrents) {
    const key = extractMovieKey(torrent.name);

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(torrent);
  }

  const hashesToDelete = [];

  // 🔥 Step 2 — Select best per movie
  for (const movie in grouped) {
    const group = grouped[movie];

    if (group.length === 1) continue; // no duplicates

    const best = selectBestTorrent(group);

    console.log(`⭐ Keeping for "${movie}":`, best.name);
        await publishMessage({
      message: `⭐ Keeping  "${best.name}":`
    });
    group
      .filter(t => t.hash !== best.hash)
      .forEach(t => hashesToDelete.push(t.hash));
  }

  if (hashesToDelete.length) {

    //uncommending the movie 


    await deleteTorrents(hashesToDelete);
    
    console.log("⚠️ Duplicate torrents deleted.");

        await publishMessage({
      message: '⚠️ Duplicate torrents deleted.'
    });

  } else {
    console.log("⚠️ No duplicates found.");
        await publishMessage({
      message: '⚠️ No duplicates found.'
    });
  }
}



export async function moveTodayShowsToTV() {
  const today = new Date().toISOString().split("T")[0];

  // 1️⃣ Get torrents filtered by tag
  const { data: torrents } = await qb.get("/api/v2/torrents/info", {
    params: {
      tag: today
    }
  });
  if (!torrents.length) {
    console.log("👍 No torrents found for today");

        await publishMessage({
      message: "👍 No torrents found for today"
    });
    return;
  }

  // 2️⃣ Identify shows (example logic: S01, S02, etc)
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
    console.log("👍 No shows found for today");

        await publishMessage({
      message: "👍 No shows found for today"
    });
    return;
  }

  const hashes = showTorrents.map(t => t.hash).join("|");

  // 3️⃣ Change category
  await qb.post(
    "/api/v2/torrents/setCategory",
    new URLSearchParams({
      hashes,
      category: "Qbit2tbTV"
    })
  );
      await publishMessage({
      message: `🔔 Moved ${showTorrents.length} shows to Qbit2tbTV`
    });
  console.log(`🔔 Moved ${showTorrents.length} shows to Qbit2tbTV`);
}