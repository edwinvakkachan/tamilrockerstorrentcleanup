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

function getTorrentSize(torrent) {
  const size = Number(torrent.size);

  if (Number.isFinite(size) && size > 0) {
    return size;
  }

  return 0;
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

      if (aPre !== bPre) {
        return aPre ? 1 : -1;
      }

      // Prefer Malayalam
      const aMal = isMalayalam(a.name);
      const bMal = isMalayalam(b.name);

      if (aMal !== bMal) {
        return bMal ? 1 : -1;
      }

      // Prefer 1080p
      const a1080 = /1080p/i.test(a.name);
      const b1080 = /1080p/i.test(b.name);

      if (a1080 !== b1080) {
        return b1080 ? 1 : -1;
      }

      // Prefer HEVC
      const aHevc = /hevc|x265/i.test(a.name);
      const bHevc = /hevc|x265/i.test(b.name);

      if (aHevc !== bHevc) {
        return bHevc ? 1 : -1;
      }

      // Prefer WEB-DL
      const aWeb = /web[- ]dl/i.test(a.name);
      const bWeb = /web[- ]dl/i.test(b.name);

      if (aWeb !== bWeb) {
        return bWeb ? 1 : -1;
      }

      // Larger size
      return getTorrentSize(b) - getTorrentSize(a);
    });
}

/* --------------------------------------------------
   Movie Helpers
-------------------------------------------------- */

function getResolutionValue(name) {
  const match = name.match(
    /\b(2160p|1440p|1080p|720p|576p|480p|360p)\b/i
  );

  if (!match) return 0;

  return Number(match[1].replace("p", ""));
}

/*
 * General movie sorter.
 *
 * Used after the resolution has already been selected.
 *
 * Priority:
 * 1. Non-PreDVD
 * 2. Malayalam
 * 3. Resolution
 * 4. Smallest file
 * 5. HEVC/x265
 * 6. WEB-DL
 */
function sortByLanguageAndSize(list) {
  return [...list].sort((a, b) => {
    // Avoid PreDVD
    const aPre = isPreDVD(a.name);
    const bPre = isPreDVD(b.name);

    if (aPre !== bPre) {
      return aPre ? 1 : -1;
    }

    // Prefer Malayalam
    const langDiff =
      detectLanguagePriority(b.name) -
      detectLanguagePriority(a.name);

    if (langDiff !== 0) {
      return langDiff;
    }

    // Prefer 1080p
    const aResolution = getResolutionValue(a.name);
    const bResolution = getResolutionValue(b.name);

    if (aResolution !== bResolution) {
      if (aResolution === 1080) return -1;
      if (bResolution === 1080) return 1;

      return bResolution - aResolution;
    }

    // Prefer smallest file
    const sizeDiff =
      getTorrentSize(a) - getTorrentSize(b);

    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    // Prefer HEVC/x265 when size is equal
    const aHevc = /hevc|x265/i.test(a.name);
    const bHevc = /hevc|x265/i.test(b.name);

    if (aHevc !== bHevc) {
      return bHevc ? 1 : -1;
    }

    // Prefer WEB-DL
    const aWeb = /web[- ]dl/i.test(a.name);
    const bWeb = /web[- ]dl/i.test(b.name);

    if (aWeb !== bWeb) {
      return bWeb ? 1 : -1;
    }

    return 0;
  });
}

/* --------------------------------------------------
   Select Best Torrent
-------------------------------------------------- */

function selectBestTorrent(torrents) {
  if (!torrents || !torrents.length) {
    return null;
  }

  /*
   * ==================================================
   * ONLY USE TORRENTS WITH VALID QBITTORRENT METADATA
   * ==================================================
   *
   * Size is taken ONLY from:
   *
   *     torrent.size
   *
   * We do NOT read size from the torrent title.
   *
   * If metadata has not downloaded yet, qBittorrent
   * can report size = 0. Such torrents are ignored.
   */

  const metadataReady = torrents.filter(t => {
    const size = Number(t.size);

    return (
      Number.isFinite(size) &&
      size > 0 &&
      typeof t.name === "string" &&
      t.name.trim() !== ""
    );
  });

  if (!metadataReady.length) {
    console.log(
      "No torrents have valid qBittorrent metadata yet."
    );

    return null;
  }

  /*
   * ==================================================
   * TV SHOWS
   * ==================================================
   */

  const tvTorrents = metadataReady.filter(t =>
    isTVShow(t.name)
  );

  if (tvTorrents.length > 0) {
    const sortedTV = sortTVTorrents(tvTorrents);

    if (sortedTV.length > 0) {
      return sortedTV[0];
    }
  }

  /*
   * ==================================================
   * REMOVE PRE-DVD
   * ==================================================
   *
   * If normal releases exist, don't select PreDVD.
   */

  const nonPreDVD = metadataReady.filter(
    t => !isPreDVD(t.name)
  );

  const candidates =
    nonPreDVD.length > 0
      ? nonPreDVD
      : metadataReady;

  /*
   * ==================================================
   * MALAYALAM PREFERENCE
   * ==================================================
   */

  const malayalamTorrents = candidates.filter(t =>
    isMalayalam(t.name)
  );

  const pool =
    malayalamTorrents.length > 0
      ? malayalamTorrents
      : candidates;

  /*
   * ==================================================
   * HELPERS
   * ==================================================
   */

  const sizeOf = torrent =>
    Number(torrent.size);

  const resolutionOf = torrent =>
    getResolutionValue(torrent.name);

  const is1080 = torrent =>
    resolutionOf(torrent) === 1080;

  const is720 = torrent =>
    resolutionOf(torrent) === 720;

  const isHEVC = torrent =>
    /hevc|x265/i.test(torrent.name);

  /*
   * ==================================================
   * 1. PREFER 1080p <= 3.5 GB
   * ==================================================
   *
   * If multiple suitable 1080p files exist:
   *
   *     choose the SMALLEST actual torrent size.
   *
   * Example:
   *
   * 1080p 1.8 GB
   * 1080p 2.4 GB
   * 1080p 3.2 GB
   *
   * -> 1.8 GB
   */

  const MAX_1080_SIZE =
    3.5 * 1024 * 1024 * 1024;

  const suitable1080 = pool.filter(t =>
    is1080(t) &&
    sizeOf(t) <= MAX_1080_SIZE
  );

  if (suitable1080.length > 0) {

    return [...suitable1080].sort(
      (a, b) => {

        /*
         * Smallest actual qBittorrent size.
         */
        const sizeDiff =
          sizeOf(a) - sizeOf(b);

        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        /*
         * Same size:
         * Prefer HEVC/x265.
         */
        const hevcDiff =
          Number(isHEVC(b)) -
          Number(isHEVC(a));

        if (hevcDiff !== 0) {
          return hevcDiff;
        }

        /*
         * Same size/codec:
         * Prefer WEB-DL.
         */
        const aWeb =
          /web[- ]dl/i.test(a.name);

        const bWeb =
          /web[- ]dl/i.test(b.name);

        return Number(bWeb) - Number(aWeb);
      }
    )[0];
  }

  /*
   * ==================================================
   * 2. NO SUITABLE 1080p
   *
   * LOOK FOR 720p
   * ==================================================
   */

  const torrents720 = pool.filter(is720);

  if (torrents720.length > 0) {

    const MAX_720_SIZE =
      2 * 1024 * 1024 * 1024;

    /*
     * --------------------------------------------------
     * 720p <= 2 GB
     * --------------------------------------------------
     *
     * Choose the LARGEST file up to 2 GB.
     *
     * Example:
     *
     * 720p 700 MB
     * 720p 1.5 GB
     * 720p 2.0 GB
     *
     * -> 2.0 GB
     */

    const suitable720 = torrents720.filter(t =>
      sizeOf(t) <= MAX_720_SIZE
    );

    if (suitable720.length > 0) {

      return [...suitable720].sort(
        (a, b) => {

          /*
           * Largest file first.
           */
          const sizeDiff =
            sizeOf(b) - sizeOf(a);

          if (sizeDiff !== 0) {
            return sizeDiff;
          }

          /*
           * Same size:
           * Prefer HEVC/x265.
           */
          const hevcDiff =
            Number(isHEVC(b)) -
            Number(isHEVC(a));

          if (hevcDiff !== 0) {
            return hevcDiff;
          }

          /*
           * Same size/codec:
           * Prefer WEB-DL.
           */
          const aWeb =
            /web[- ]dl/i.test(a.name);

          const bWeb =
            /web[- ]dl/i.test(b.name);

          return Number(bWeb) - Number(aWeb);
        }
      )[0];
    }

    /*
     * --------------------------------------------------
     * 720p EXISTS BUT ALL ARE > 2 GB
     * --------------------------------------------------
     *
     * Choose the smallest 720p.
     */

    return [...torrents720].sort(
      (a, b) => {

        const sizeDiff =
          sizeOf(a) - sizeOf(b);

        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        const hevcDiff =
          Number(isHEVC(b)) -
          Number(isHEVC(a));

        if (hevcDiff !== 0) {
          return hevcDiff;
        }

        return 0;
      }
    )[0];
  }

  /*
   * ==================================================
   * 3. NO 720p
   *
   * USE 1080p EVEN IF > 3.5 GB
   * ==================================================
   *
   * Example:
   *
   * 1080p 4 GB
   * 480p 720 MB
   *
   * -> 1080p 4 GB
   */

  const all1080 = pool.filter(is1080);

  if (all1080.length > 0) {

    return [...all1080].sort(
      (a, b) => {

        /*
         * Choose the smallest 1080p.
         */
        const sizeDiff =
          sizeOf(a) - sizeOf(b);

        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        const hevcDiff =
          Number(isHEVC(b)) -
          Number(isHEVC(a));

        if (hevcDiff !== 0) {
          return hevcDiff;
        }

        return 0;
      }
    )[0];
  }

  /*
   * ==================================================
   * 4. NO 1080p OR 720p
   *
   * CHOOSE HIGHEST AVAILABLE RESOLUTION
   * ==================================================
   *
   * Example:
   *
   * 4K 7 GB
   * 480p 720 MB
   *
   * -> 4K 7 GB
   */

  const resolutionTorrents =
    pool.filter(t =>
      resolutionOf(t) > 0
    );

  if (resolutionTorrents.length > 0) {

    const highestResolution =
      Math.max(
        ...resolutionTorrents.map(
          resolutionOf
        )
      );

    const highestResolutionTorrents =
      resolutionTorrents.filter(t =>
        resolutionOf(t) ===
        highestResolution
      );

    /*
     * If multiple files have the same highest
     * resolution, choose the smallest actual size.
     */

    return [...highestResolutionTorrents].sort(
      (a, b) => {

        const sizeDiff =
          sizeOf(a) - sizeOf(b);

        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        const hevcDiff =
          Number(isHEVC(b)) -
          Number(isHEVC(a));

        if (hevcDiff !== 0) {
          return hevcDiff;
        }

        return 0;
      }
    )[0];
  }

  /*
   * ==================================================
   * 5. NO RECOGNIZABLE RESOLUTION
   *
   * Choose the smallest actual qBittorrent torrent.
   * ==================================================
   */

  return [...pool].sort(
    (a, b) =>
      sizeOf(a) - sizeOf(b)
  )[0];
}

/* --------------------------------------------------
   Cleanup Torrents
-------------------------------------------------- */

function extractMovieKey(name) {
  const match = name.match(
    /-\s*(.+?\(\d{4}\))/
  );

  if (match) {
    return match[1]
      .trim()
      .toLowerCase();
  }

  return name
    .replace(
      /\b(2160p|1080p|720p|480p|x265|x264|HEVC|HDRip|WEB-DL|AAC|DD5\.1)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function getTorrentsByTag(tag) {
  const { data } = await qb.get(
    "/api/v2/torrents/info",
    {
      params: { tag }
    }
  );

  await delay(3000, true);

  return data;
}

export async function deleteTorrents(hashes) {
  if (!hashes.length) {
    return;
  }

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
    message:
      `Searching QB torrents with tag: ${tag}`
  });

  console.log(
    `Searching QB torrents with tag: ${tag}`
  );

  const torrents =
    await getTorrentsByTag(tag);

  await delay(2000, true);

  if (!torrents.length) {

    console.log(
      "No torrents found for today cleanup"
    );

    await publishMessage({
      message:
        "No torrents found for today cleanup"
    });

    return;
  }

  const grouped = {};

  for (const torrent of torrents) {

    const key =
      extractMovieKey(torrent.name);

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(torrent);
  }

  const hashesToDelete = [];

  for (const movie in grouped) {

    const group = grouped[movie];

    if (group.length === 1) {
      continue;
    }

    const best =
      selectBestTorrent(group);

    const separator =
      "========================================";

    console.log(separator);

    await publishMessage({
      message: separator
    });

    console.log(
      `Checking duplicates for: ${movie}`
    );

    await publishMessage({
      message:
        `Checking duplicates for: ${movie}`
    });

    for (const torrent of group) {

      console.log(
        `Candidate: ${torrent.name}`
      );

      await publishMessage({
        message:
          `Candidate: ${torrent.name}`
      });
    }

    if (!best) {
  console.log(
    `Skipping ${movie}:🤬 no torrent has completed metadata yet.`
  );

  await publishMessage({
    message:
      `Skipping ${movie}: 🤬 no torrent has completed metadata yet.`
  });

  continue;
}
    console.log(
      `Keeping: ${best.name}`
    );

    await publishMessage({
      message:
        `Keeping: ${best.name}`
    });

    group
      .filter(t =>
        t.hash !== best.hash
      )
      .forEach(t =>
        hashesToDelete.push(t.hash)
      );
  }

  if (hashesToDelete.length) {

    await deleteTorrents(
      hashesToDelete
    );

    console.log(
      "Duplicate torrents deleted"
    );

  } else {

    console.log(
      "No duplicates found"
    );
  }
}