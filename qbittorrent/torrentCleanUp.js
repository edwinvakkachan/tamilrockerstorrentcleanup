
import { qb } from "./qb.js";
import { publishMessage } from "../queue/publishMessage.js";
import { delay } from "../delay.js";
import { queueRadarrCleanup } from "../radarrCleanupQueue.js";
import {
  analyzeResolutions,
  getAnalyzedResolution
} from "../resolutionAnalyzer.js";

const TWO_GB = 2 * 1024 * 1024 * 1024;
const THREE_GB = 3 * 1024 * 1024 * 1024;
const FIVE_GB = 5 * 1024 * 1024 * 1024;

/*
 * ============================================================
 * METADATA RETRY SETTINGS
 * ============================================================
 */

const METADATA_RETRY_INTERVAL = 30 * 1000; // 30 seconds
const METADATA_MAX_RETRIES = 20;           // 10 minutes


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

      const aPre = isPreDVD(a.name);
      const bPre = isPreDVD(b.name);

      if (aPre !== bPre) {
        return aPre ? 1 : -1;
      }

      const aMal = isMalayalam(a.name);
      const bMal = isMalayalam(b.name);

      if (aMal !== bMal) {
        return bMal ? 1 : -1;
      }

      const a1080 = /1080p/i.test(a.name);
      const b1080 = /1080p/i.test(b.name);

      if (a1080 !== b1080) {
        return b1080 ? 1 : -1;
      }

      const aHevc = /hevc|x265/i.test(a.name);
      const bHevc = /hevc|x265/i.test(b.name);

      if (aHevc !== bHevc) {
        return bHevc ? 1 : -1;
      }

      const aWeb = /web[- ]dl/i.test(a.name);
      const bWeb = /web[- ]dl/i.test(b.name);

      if (aWeb !== bWeb) {
        return bWeb ? 1 : -1;
      }

      return getTorrentSize(b) - getTorrentSize(a);
    });
}


/* --------------------------------------------------
   Movie Helpers
-------------------------------------------------- */

function sortByLanguageAndSize(list) {
  return [...list].sort((a, b) => {

    const aPre = isPreDVD(a.name);
    const bPre = isPreDVD(b.name);

    if (aPre !== bPre) {
      return aPre ? 1 : -1;
    }

    const langDiff =
      detectLanguagePriority(b.name) -
      detectLanguagePriority(a.name);

    if (langDiff !== 0) {
      return langDiff;
    }

    const aResolution =
      getAnalyzedResolution(a);

    const bResolution =
      getAnalyzedResolution(b);

    if (aResolution !== bResolution) {

      if (aResolution === 1080) {
        return -1;
      }

      if (bResolution === 1080) {
        return 1;
      }

      return bResolution - aResolution;
    }

    const sizeDiff =
      getTorrentSize(a) -
      getTorrentSize(b);

    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    const aHevc =
      /hevc|x265/i.test(a.name);

    const bHevc =
      /hevc|x265/i.test(b.name);

    if (aHevc !== bHevc) {
      return bHevc ? 1 : -1;
    }

    const aWeb =
      /web[- ]dl/i.test(a.name);

    const bWeb =
      /web[- ]dl/i.test(b.name);

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

  if (
    !torrents ||
    !torrents.length
  ) {
    return null;
  }

  /*
   * ==================================================
   * ABSOLUTE PRE-DVD RULE
   * ==================================================
   */

  const hasNonPreDVD =
    torrents.some(
      t =>
        typeof t.name === "string" &&
        t.name.trim() !== "" &&
        !isPreDVD(t.name)
    );

  const selectionSource =
    hasNonPreDVD
      ? torrents.filter(
          t => !isPreDVD(t.name)
        )
      : torrents;

  /*
   * ==================================================
   * ONLY USE TORRENTS WITH VALID QB METADATA
   * ==================================================
   */

  const metadataReady =
    selectionSource.filter(t => {

      const size =
        Number(t.size);

      return (
        Number.isFinite(size) &&
        size > 0 &&
        typeof t.name === "string" &&
        t.name.trim() !== ""
      );
    });

  if (!metadataReady.length) {

    console.log(
      hasNonPreDVD
        ? "No non-PreDVD torrents have valid qBittorrent metadata yet."
        : "No torrents have valid qBittorrent metadata yet."
    );

    return null;
  }

  /*
   * ==================================================
   * TV SHOWS
   * ==================================================
   */

  const tvTorrents =
    metadataReady.filter(
      t => isTVShow(t.name)
    );

  if (tvTorrents.length > 0) {

    const sortedTV =
      sortTVTorrents(
        tvTorrents
      );

    if (sortedTV.length > 0) {
      return sortedTV[0];
    }
  }

  /*
   * ==================================================
   * MALAYALAM PREFERENCE
   * ==================================================
   */

  const malayalamTorrents =
    metadataReady.filter(
      t => isMalayalam(t.name)
    );

  const pool =
    malayalamTorrents.length > 0
      ? malayalamTorrents
      : metadataReady;

  const sizeOf =
    torrent =>
      Number(torrent.size);

  const resolutionOf =
    torrent =>
      getAnalyzedResolution(torrent);

  const is1080 =
    torrent =>
      resolutionOf(torrent) === 1080;

  const is720 =
    torrent =>
      resolutionOf(torrent) === 720;

  const isHEVC =
    torrent =>
      /hevc|x265/i.test(
        torrent.name
      );

  /*
   * ==================================================
   * RESOLUTION DEBUG
   * ==================================================
   */

  console.log(
    "\n🔎 RESOLUTION DEBUG:"
  );

  for (const t of pool) {

    console.log(
      `${t.name} | ` +
      `size=${sizeOf(t)} | ` +
      `resolution=${resolutionOf(t)} | ` +
      `source=${t.resolutionSource || "filename"} | ` +
      `is1080=${is1080(t)} | ` +
      `is720=${is720(t)}`
    );
  }

  /*
   * ==================================================
   * 1. PREFER 1080p <= 3.5 GB
   * ==================================================
   */

  const MAX_1080_SIZE =
    3.5 *
    1024 *
    1024 *
    1024;

  const suitable1080 =
    pool.filter(t =>
      is1080(t) &&
      sizeOf(t) <=
        MAX_1080_SIZE
    );

  console.log(
    "\n🎯 1080p candidates:"
  );

  for (
    const t of suitable1080
  ) {

    console.log(
      `${t.name} | size=${sizeOf(t)}`
    );
  }

  if (
    suitable1080.length > 0
  ) {

    return [...suitable1080]
      .sort((a, b) => {

        const sizeDiff =
          sizeOf(a) -
          sizeOf(b);

        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        const hevcDiff =
          Number(isHEVC(b)) -
          Number(isHEVC(a));

        if (hevcDiff !== 0) {
          return hevcDiff;
        }

        const aWeb =
          /web[- ]dl/i.test(
            a.name
          );

        const bWeb =
          /web[- ]dl/i.test(
            b.name
          );

        return (
          Number(bWeb) -
          Number(aWeb)
        );

      })[0];
  }

  /*
   * ==================================================
   * 2. NO SUITABLE 1080p
   *
   * LOOK FOR 720p
   * ==================================================
   */

  const torrents720 =
    pool.filter(is720);

  if (
    torrents720.length > 0
  ) {

    const MAX_720_SIZE =
      2 *
      1024 *
      1024 *
      1024;

    const suitable720 =
      torrents720.filter(
        t =>
          sizeOf(t) <=
          MAX_720_SIZE
      );

    if (
      suitable720.length > 0
    ) {

      return [...suitable720]
        .sort((a, b) => {

          const sizeDiff =
            sizeOf(b) -
            sizeOf(a);

          if (sizeDiff !== 0) {
            return sizeDiff;
          }

          const hevcDiff =
            Number(isHEVC(b)) -
            Number(isHEVC(a));

          if (hevcDiff !== 0) {
            return hevcDiff;
          }

          const aWeb =
            /web[- ]dl/i.test(
              a.name
            );

          const bWeb =
            /web[- ]dl/i.test(
              b.name
            );

          return (
            Number(bWeb) -
            Number(aWeb)
          );

        })[0];
    }

    /*
     * 720p exists but all are >2GB.
     * Choose smallest 720p.
     */

    return [...torrents720]
      .sort((a, b) => {

        const sizeDiff =
          sizeOf(a) -
          sizeOf(b);

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

      })[0];
  }

  /*
   * ==================================================
   * 3. NO 720p
   *
   * USE 1080p EVEN IF >3.5GB
   * ==================================================
   */

  const all1080 =
    pool.filter(is1080);

  if (
    all1080.length > 0
  ) {

    return [...all1080]
      .sort((a, b) => {

        const sizeDiff =
          sizeOf(a) -
          sizeOf(b);

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

      })[0];
  }

  /*
   * ==================================================
   * 4. NO 1080p OR 720p
   *
   * CHOOSE HIGHEST AVAILABLE RESOLUTION
   * ==================================================
   */

  const resolutionTorrents =
    pool.filter(
      t =>
        resolutionOf(t) > 0
    );

  if (
    resolutionTorrents.length > 0
  ) {

    const highestResolution =
      Math.max(
        ...resolutionTorrents.map(
          resolutionOf
        )
      );

    const highestResolutionTorrents =
      resolutionTorrents.filter(
        t =>
          resolutionOf(t) ===
          highestResolution
      );

    return [
      ...highestResolutionTorrents
    ].sort((a, b) => {

      const sizeDiff =
        sizeOf(a) -
        sizeOf(b);

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

    })[0];
  }

  /*
   * ==================================================
   * 5. NO RECOGNIZABLE RESOLUTION
   * ==================================================
   */

  return [...pool].sort(
    (a, b) =>
      sizeOf(a) -
      sizeOf(b)
  )[0];
}


/* --------------------------------------------------
   Cleanup Helpers
-------------------------------------------------- */

function extractMovieKey(name) {

  const match =
    name.match(
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
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .toLowerCase();
}


/* --------------------------------------------------
   Get Torrents By Tag
-------------------------------------------------- */

export async function getTorrentsByTag(tag) {

  const { data } =
    await qb.get(
      "/api/v2/torrents/info",
      {
        params: {
          tag
        }
      }
    );

  await delay(
    3000,
    true
  );

  return data;
}


/* --------------------------------------------------
   Delete Torrents
-------------------------------------------------- */

export async function deleteTorrents(
  hashes
) {

  if (!hashes.length) {
    return;
  }

  await qb.post(
    "/api/v2/torrents/delete",
    new URLSearchParams({
      hashes:
        hashes.join("|"),

      deleteFiles:
        "true"
    })
  );
}


/* ============================================================
   NEW:
   GET CURRENT MOVIE GROUP AGAIN
   ============================================================ */

async function getCurrentMovieGroup(
  tag,
  movieKey
) {

  const currentTorrents =
    await getTorrentsByTag(tag);

  const currentGroup =
    currentTorrents.filter(
      torrent =>
        extractMovieKey(
          torrent.name
        ) === movieKey
    );

  return currentGroup;
}


/* ============================================================
   NEW:
   CHECK WHETHER METADATA IS READY
   ============================================================ */

function hasCompletedMetadata(
  torrents
) {

  if (
    !Array.isArray(torrents) ||
    torrents.length === 0
  ) {
    return false;
  }

  return torrents.some(torrent => {

    const size =
      Number(torrent.size);

    return (
      Number.isFinite(size) &&
      size > 0 &&
      typeof torrent.name === "string" &&
      torrent.name.trim() !== ""
    );
  });
}


/* ============================================================
   NEW:
   WAIT FOR MOVIE METADATA
   ============================================================
 *
 * Only called when selectBestTorrent() returns null.
 *
 * It re-fetches qBittorrent every 30 seconds.
 *
 * IMPORTANT:
 * It does NOT restart cleanupTodayTorrents().
 * It only waits for this movie.
 *
 * ============================================================
 */

async function waitForMovieMetadata(
  tag,
  movieKey,
  initialGroup
) {

  let currentGroup =
    initialGroup;

  /*
   * If metadata is already available,
   * no retry is required.
   */

  if (
    hasCompletedMetadata(
      currentGroup
    )
  ) {

    return currentGroup;
  }

  console.log(
    `⏳ Metadata not ready for ${movieKey}. ` +
    `Waiting for qBittorrent metadata...`
  );

  await publishMessage({
    message:
      `⏳ Metadata not ready for ${movieKey}. ` +
      `Waiting for qBittorrent metadata...`
  });


  for (
    let attempt = 1;
    attempt <= METADATA_MAX_RETRIES;
    attempt++
  ) {

    console.log(
      `⏳ ${movieKey}: metadata retry ` +
      `${attempt}/${METADATA_MAX_RETRIES} ` +
      `(next check in 30 seconds)`
    );

    await publishMessage({
      message:
        `⏳ ${movieKey}: metadata retry ` +
        `${attempt}/${METADATA_MAX_RETRIES}`
    });

    await delay(
      METADATA_RETRY_INTERVAL,
      true
    );


    /*
     * Re-fetch the current qBittorrent list.
     */

    try {

      currentGroup =
        await getCurrentMovieGroup(
          tag,
          movieKey
        );

    } catch (error) {

      console.error(
        `❌ Failed to refresh metadata for ${movieKey}:`,
        error
      );

      continue;
    }


    /*
     * Movie may have disappeared.
     */

    if (
      !currentGroup.length
    ) {

      console.log(
        `⚠️ ${movieKey} is no longer present in qBittorrent.`
      );

      return [];
    }


    /*
     * Check whether at least one torrent
     * now has completed qBittorrent metadata.
     */

    if (
      hasCompletedMetadata(
        currentGroup
      )
    ) {

      console.log(
        `✅ Metadata completed for ${movieKey} ` +
        `after ${attempt} retry attempt(s).`
      );

      await publishMessage({
        message:
          `✅ Metadata completed for ${movieKey} ` +
          `after ${attempt} retry attempt(s).`
      });

      return currentGroup;
    }
  }


  /*
   * Metadata never became available.
   */

  console.log(
    `⏰ Metadata still incomplete for ${movieKey} ` +
    `after ${METADATA_MAX_RETRIES} retries.`
  );

  await publishMessage({
    message:
      `⏰ Metadata still incomplete for ${movieKey} ` +
      `after ${METADATA_MAX_RETRIES} retries.`
  });

  return null;
}


/* --------------------------------------------------
   Cleanup Torrents
-------------------------------------------------- */

export async function cleanupTodayTorrents() {

  let metadataRetryNeeded = false;
  const tag =
    "script";

  await publishMessage({
    message:
      `Searching QB torrents with tag: ${tag}`
  });

  console.log(
    `Searching QB torrents with tag: ${tag}`
  );


  /*
   * Initial torrent list.
   */

  let torrents =
    await getTorrentsByTag(tag);

  await delay(
    2000,
    true
  );


  if (
    !torrents.length
  ) {

    console.log(
      "No torrents found for today cleanup"
    );

    await publishMessage({
      message:
        "No torrents found for today cleanup"
    });

    return;
  }


  /*
   * ==================================================
   * GROUP TORRENTS BY MOVIE
   * ==================================================
   */

  const grouped = {};

  for (
    const torrent
    of torrents
  ) {

    const key =
      extractMovieKey(
        torrent.name
      );

    if (
      !grouped[key]
    ) {

      grouped[key] = [];
    }

    grouped[key].push(
      torrent
    );
  }


  const hashesToDelete = [];


  /*
   * ==================================================
   * PROCESS EACH MOVIE
   * ==================================================
   */

  for (
    const movie
    in grouped
  ) {

    let group =
      grouped[movie];


    /*
     * Only one torrent:
     * nothing to clean.
     */

    if (
      group.length === 1
    ) {
      continue;
    }


    /*
     * ==================================================
     * FIRST RESOLUTION ANALYSIS
     *
     * IMPORTANT:
     * Analyze the COMPLETE group.
     * ==================================================
     */

    let analyzedGroup =
      analyzeResolutions(
        group
      );


    let best =
      selectBestTorrent(
        analyzedGroup
      );


    /*
     * ==================================================
     * IF NO TORRENT HAS COMPLETED METADATA:
     *
     * WAIT AND RE-FETCH THIS MOVIE.
     * ==================================================
     */

    if (!best) {

      const refreshedGroup =
        await waitForMovieMetadata(
          tag,
          movie,
          group
        );


      /*
       * Metadata still unavailable.
       */

      if (
        !refreshedGroup ||
        !refreshedGroup.length
      ) {
        metadataRetryNeeded = true;

        console.log(
          `Skipping ${movie}: 🤬 no torrent has completed metadata yet.`
        );

        await publishMessage({
          message:
            `Skipping ${movie}: 🤬 no torrent has completed metadata yet.`
        });
        
        continue;
      }


      /*
       * Use the freshly fetched qBittorrent
       * objects from this point onward.
       */

      group =
        refreshedGroup;


      /*
       * Re-run resolution analysis using
       * the NEW metadata.
       */

      analyzedGroup =
        analyzeResolutions(
          group
        );


      /*
       * Run the complete existing selection
       * logic again.
       */

      best =
        selectBestTorrent(
          analyzedGroup
        );


      /*
       * Extremely unlikely, but protect against
       * metadata disappearing between requests.
       */

      if (!best) {
        metadataRetryNeeded = true;

        console.log(
          `Skipping ${movie}: 🤬 no torrent has completed metadata yet.`
        );

        await publishMessage({
          message:
            `Skipping ${movie}: 🤬 no torrent has completed metadata yet.`
        });

        continue;
      }
    }


    /*
     * ==================================================
     * DISPLAY CANDIDATES
     * ==================================================
     */

    const separator =
      "========================================";

    console.log(
      separator
    );

    await publishMessage({
      message:
        separator
    });


    console.log(
      `Checking duplicates for: ${movie}`
    );

    await publishMessage({
      message:
        `Checking duplicates for: ${movie}`
    });


    for (
      const torrent
      of group
    ) {

      console.log(
        `Candidate: ${torrent.name}`
      );

      await publishMessage({
        message:
          `Candidate: ${torrent.name}`
      });
    }


    /*
     * ==================================================
     * KEEP BEST
     * ==================================================
     */

    console.log(
      `Keeping: ${best.name}`
    );

    await publishMessage({
      message:
        `Keeping: ${best.name}`
    });


    /*
     * ==================================================
     * DELETE ALL OTHER TORRENTS
     * ==================================================
     */

    const torrentsToDelete =
      group.filter(
        t =>
          t.hash !==
          best.hash
      );


    for (
      const torrent
      of torrentsToDelete
    ) {

      /*
       * If this is a PreDVD torrent carrying
       * the predvd tag, add the movie to the
       * Radarr cleanup queue.
       */

      if (
        isPreDVD(
          torrent.name
        ) &&
        String(
          torrent.tags || ""
        )
          .split(",")
          .map(
            tag =>
              tag
                .trim()
                .toLowerCase()
          )
          .includes(
            "predvd"
          )
      ) {

        await queueRadarrCleanup(
          torrent
        );
      }


      hashesToDelete.push(
        torrent.hash
      );
    }
  }


  /*
   * ==================================================
   * DELETE DUPLICATES
   * ==================================================
   */

  if (
    hashesToDelete.length
  ) {

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
  return !metadataRetryNeeded;
}