import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";
import { delay } from "../delay.js";

const TWO_GB = 2 * 1024 * 1024 * 1024;
const THREE_GB = 3 * 1024 * 1024 * 1024;
const FIVE_GB = 5 * 1024 * 1024 * 1024;

/* --------------------------------------------------
   Common Helper Functions
-------------------------------------------------- */

function isTVShow(name) {
  return /\bS\d{1,2}\s?(E\d{1,2}|EP)\b/i.test(name);
}

function isMalayalam(name) {
  return hasFullMalayalam(name) || hasMalayalamCode(name);
}

function isPreDVD(name) {
  return /\bpredvd\b/i.test(name);
}

function parseSizeFromName(name) {
  const match = name.match(/\b(\d+(?:\.\d+)?)\s*(GB|GIB|MB|MIB)\b/i);

  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(value)) return null;

  if (unit === "gb" || unit === "gib") {
    return value * 1024 * 1024 * 1024;
  }

  return value * 1024 * 1024;
}

function getTorrentSize(torrent) {
  return parseSizeFromName(torrent.name) ?? torrent.size ?? 0;
}

function hasFullMalayalam(name) {
  return /\bmalayalam\b/i.test(name);
}

function hasMalayalamCode(name) {
  return /\bmal\b/i.test(name);
}

function hasFullHindi(name) {
  return /\bhindi\b/i.test(name);
}

function hasHindiCode(name) {
  return /\bhin\b/i.test(name);
}

function hasFullTamil(name) {
  return /\btamil\b/i.test(name);
}

function hasTamilCode(name) {
  return /\btam\b/i.test(name);
}

function detectLanguagePriority(name) {
  if (hasFullMalayalam(name)) return 60;
  if (hasMalayalamCode(name)) return 50;
  if (hasFullHindi(name)) return 40;
  if (hasHindiCode(name)) return 30;
  if (hasFullTamil(name)) return 20;
  if (hasTamilCode(name)) return 10;

  return 0;
}

/* --------------------------------------------------
   TV Torrent Sorting
-------------------------------------------------- */

function sortTVTorrents(list) {
  return [...list]
    .filter(t => getTorrentSize(t) < FIVE_GB)
    .sort((a, b) => {
      // Avoid PreDVD
      const aPre = isPreDVD(a.name);
      const bPre = isPreDVD(b.name);
      if (aPre !== bPre) return aPre ? 1 : -1;

      // Prefer Malayalam
      const aMal = isMalayalam(a.name);
      const bMal = isMalayalam(b.name);
      if (aMal !== bMal) return bMal ? 1 : -1;

      // Prefer 1080p
      const a1080 = /1080p/i.test(a.name);
      const b1080 = /1080p/i.test(b.name);
      if (a1080 !== b1080) return b1080 ? 1 : -1;

      // Prefer HEVC
      const aHevc = /hevc|x265/i.test(a.name);
      const bHevc = /hevc|x265/i.test(b.name);
      if (aHevc !== bHevc) return bHevc ? 1 : -1;

      // Prefer WEB-DL
      const aWeb = /web[- ]dl/i.test(a.name);
      const bWeb = /web[- ]dl/i.test(b.name);
      if (aWeb !== bWeb) return bWeb ? 1 : -1;

      // Larger size
      return getTorrentSize(b) - getTorrentSize(a);
    });
}

/* --------------------------------------------------
   Movie Sorting
-------------------------------------------------- */

function sortByLanguageAndSize(list) {
  return [...list].sort((a, b) => {
    // Avoid PreDVD
    const aPre = isPreDVD(a.name);
    const bPre = isPreDVD(b.name);
    if (aPre !== bPre) return aPre ? 1 : -1;

    // Language priority
    const langDiff =
      detectLanguagePriority(b.name) -
      detectLanguagePriority(a.name);

    if (langDiff !== 0) return langDiff;

    // Larger size preferred
    return getTorrentSize(b) - getTorrentSize(a);
  });
}

/* --------------------------------------------------
   Select Best Torrent
-------------------------------------------------- */

function selectBestTorrent(torrents) {
  const tvTorrents = torrents.filter(t => isTVShow(t.name));

  if (tvTorrents.length > 0) {
    const sortedTV = sortTVTorrents(tvTorrents);
    if (sortedTV.length > 0) {
      return sortedTV[0];
    }
  }

  const fullMalayalamTorrents = torrents.filter(t => hasFullMalayalam(t.name));

  if (fullMalayalamTorrents.length > 0) {
    const fullMalayalam1080 = fullMalayalamTorrents.filter(t =>
      /1080p/i.test(t.name)
    );

    if (fullMalayalam1080.length > 0) {
      return sortByLanguageAndSize(fullMalayalam1080)[0];
    }

    const fullMalayalam720 = fullMalayalamTorrents.filter(t =>
      /720p/i.test(t.name)
    );

    if (fullMalayalam720.length > 0) {
      return sortByLanguageAndSize(fullMalayalam720)[0];
    }

    return sortByLanguageAndSize(fullMalayalamTorrents)[0];
  }

  const malCodeTorrents = torrents.filter(t => hasMalayalamCode(t.name));

  if (malCodeTorrents.length > 0) {
    const malCode1080Under3gb = malCodeTorrents.filter(t =>
      /1080p/i.test(t.name) && getTorrentSize(t) < THREE_GB
    );

    if (malCode1080Under3gb.length > 0) {
      return sortByLanguageAndSize(malCode1080Under3gb)[0];
    }

    const malCode720 = malCodeTorrents.filter(t =>
      /720p/i.test(t.name)
    );

    if (malCode720.length > 0) {
      return sortByLanguageAndSize(malCode720)[0];
    }

    const malCode1080 = malCodeTorrents.filter(t =>
      /1080p/i.test(t.name)
    );

    if (malCode1080.length > 0) {
      return sortByLanguageAndSize(malCode1080)[0];
    }

    return sortByLanguageAndSize(malCodeTorrents)[0];
  }

  const preferred1080 = torrents.filter(t =>
    /1080p/i.test(t.name) && getTorrentSize(t) < THREE_GB
  );

  if (preferred1080.length > 0) {
    return sortByLanguageAndSize(preferred1080)[0];
  }

  const fallback720 = torrents.filter(t =>
    /720p/i.test(t.name)
  );

  if (fallback720.length > 0) {
    return sortByLanguageAndSize(fallback720)[0];
  }

  const under2gb = torrents.filter(t => getTorrentSize(t) < TWO_GB);

  if (under2gb.length > 0) {
    return sortByLanguageAndSize(under2gb)[0];
  }

  return sortByLanguageAndSize(torrents)[0];
}

/* --------------------------------------------------
   Cleanup Torrents
-------------------------------------------------- */

function extractMovieKey(name) {
  const match = name.match(/-\s*(.+?\(\d{4}\))/);

  if (match) {
    return match[1].trim().toLowerCase();
  }

  return name
    .replace(/\b(2160p|1080p|720p|480p|x265|x264|HEVC|HDRip|WEB-DL|AAC|DD5\.1)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function getTorrentsByTag(tag) {
  const { data } = await qb.get("/api/v2/torrents/info", {
    params: { tag }
  });
  await delay(3000, true);
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

export async function cleanupTodayTorrents() {
  const tag = "script";

  await publishMessage({
    message: `Searching QB torrents with tag: ${tag}`
  });

  console.log(`Searching QB torrents with tag: ${tag}`);

  const torrents = await getTorrentsByTag(tag);
  await delay(2000, true);

  if (!torrents.length) {
    console.log("No torrents found for today cleanup");
    await publishMessage({
      message: "No torrents found for today cleanup"
    });
    return;
  }

  const grouped = {};

  for (const torrent of torrents) {
    const key = extractMovieKey(torrent.name);

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(torrent);
  }

  const hashesToDelete = [];

  for (const movie in grouped) {
    const group = grouped[movie];

    if (group.length === 1) continue;

    const best = selectBestTorrent(group);
    const separator = "========================================";

    console.log(separator);
    await publishMessage({
      message: separator
    });

    console.log(`Checking duplicates for: ${movie}`);
    await publishMessage({
      message: `Checking duplicates for: ${movie}`
    });

    for (const torrent of group) {
      console.log(`Candidate: ${torrent.name}`);
      await publishMessage({
        message: `Candidate: ${torrent.name}`
      });
    }

    console.log(`Keeping: ${best.name}`);
    await publishMessage({
      message: `Keeping: ${best.name}`
    });

    group
      .filter(t => t.hash !== best.hash)
      .forEach(t => hashesToDelete.push(t.hash));
  }

  if (hashesToDelete.length) {
    await deleteTorrents(hashesToDelete);
    console.log("Duplicate torrents deleted");
  } else {
    console.log("No duplicates found");
  }
}

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
