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

const METADATA_RETRY_INTERVAL = 30 * 1000;


/* ============================================================
   COMMON HELPERS
============================================================ */

function isTVShow(name) {
  return /\bS\d{1,2}\s?(E\d{1,2}|EP)\b/i.test(name);
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

function isMalayalam(name) {
  return (
    hasFullMalayalam(name) ||
    hasMalayalamCode(name)
  );
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


/* ============================================================
   TV TORRENT SORTING
============================================================ */

function sortTVTorrents(list) {

  return [...list]
    .filter(
      torrent =>
        getTorrentSize(torrent) < FIVE_GB
    )
    .sort((a, b) => {

      const aPre =
        isPreDVD(a.name);

      const bPre =
        isPreDVD(b.name);

      if (aPre !== bPre) {
        return aPre ? 1 : -1;
      }


      const aMal =
        isMalayalam(a.name);

      const bMal =
        isMalayalam(b.name);

      if (aMal !== bMal) {
        return bMal ? 1 : -1;
      }


      const a1080 =
        /1080p/i.test(a.name);

      const b1080 =
        /1080p/i.test(b.name);

      if (a1080 !== b1080) {
        return b1080 ? 1 : -1;
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


      return (
        getTorrentSize(b) -
        getTorrentSize(a)
      );
    });
}


/* ============================================================
   MOVIE SORTING
============================================================ */

function sortByLanguageAndSize(list) {

  return [...list].sort((a, b) => {

    const aPre =
      isPreDVD(a.name);

    const bPre =
      isPreDVD(b.name);

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

    if (
      aResolution !==
      bResolution
    ) {

      if (aResolution === 1080) {
        return -1;
      }

      if (bResolution === 1080) {
        return 1;
      }

      return (
        bResolution -
        aResolution
      );
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


/* ============================================================
   SELECT BEST TORRENT

   IMPORTANT:

   This function only considers torrents that currently
   have valid qBittorrent metadata.

   size = 0 torrents are ignored.
============================================================ */

function selectBestTorrent(torrents) {

  if (
    !torrents ||
    !torrents.length
  ) {
    return null;
  }


  /* ----------------------------------------------------------
     PRE-DVD RULE
  ---------------------------------------------------------- */

  const hasNonPreDVD =
    torrents.some(
      torrent =>
        typeof torrent.name === "string" &&
        torrent.name.trim() !== "" &&
        !isPreDVD(torrent.name)
    );


  const selectionSource =
    hasNonPreDVD
      ? torrents.filter(
          torrent =>
            !isPreDVD(torrent.name)
        )
      : torrents;


  /* ----------------------------------------------------------
     ONLY METADATA-READY TORRENTS
  ---------------------------------------------------------- */

  const metadataReady =
    selectionSource.filter(
      torrent => {

        const size =
          Number(torrent.size);

        return (
          Number.isFinite(size) &&
          size > 0 &&
          typeof torrent.name === "string" &&
          torrent.name.trim() !== ""
        );
      }
    );


  if (
    !metadataReady.length
  ) {

    console.log(
      hasNonPreDVD
        ? "⏳ No non-PreDVD torrent has completed metadata yet."
        : "⏳ No torrent has completed metadata yet."
    );

    return null;
  }


  /* ----------------------------------------------------------
     TV SHOWS
  ---------------------------------------------------------- */

  const tvTorrents =
    metadataReady.filter(
      torrent =>
        isTVShow(torrent.name)
    );


  if (
    tvTorrents.length > 0
  ) {

    const sortedTV =
      sortTVTorrents(
        tvTorrents
      );

    if (
      sortedTV.length > 0
    ) {
      return sortedTV[0];
    }
  }


  /* ----------------------------------------------------------
     MALAYALAM PREFERENCE
  ---------------------------------------------------------- */

  const malayalamTorrents =
    metadataReady.filter(
      torrent =>
        isMalayalam(torrent.name)
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


  /* ----------------------------------------------------------
     RESOLUTION DEBUG
  ---------------------------------------------------------- */

  console.log(
    "\n🔎 RESOLUTION DEBUG:"
  );


  for (
    const torrent
    of pool
  ) {

    console.log(
      `${torrent.name} | ` +
      `size=${sizeOf(torrent)} | ` +
      `resolution=${resolutionOf(torrent)} | ` +
      `source=${torrent.resolutionSource || "filename"} | ` +
      `is1080=${is1080(torrent)} | ` +
      `is720=${is720(torrent)}`
    );
  }


  /* ----------------------------------------------------------
     1080p <= 3.5 GB
  ---------------------------------------------------------- */

  const MAX_1080_SIZE =
    3.5 *
    1024 *
    1024 *
    1024;


  const suitable1080 =
    pool.filter(
      torrent =>
        is1080(torrent) &&
        sizeOf(torrent) <=
          MAX_1080_SIZE
    );


  console.log(
    "\n🎯 1080p candidates:"
  );


  for (
    const torrent
    of suitable1080
  ) {

    console.log(
      `${torrent.name} | size=${sizeOf(torrent)}`
    );
  }


  if (
    suitable1080.length > 0
  ) {

    return [
      ...suitable1080
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


  /* ----------------------------------------------------------
     720p
  ---------------------------------------------------------- */

  const torrents720 =
    pool.filter(
      is720
    );


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
        torrent =>
          sizeOf(torrent) <=
          MAX_720_SIZE
      );


    if (
      suitable720.length > 0
    ) {

      return [
        ...suitable720
      ].sort((a, b) => {

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

    return [
      ...torrents720
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


  /* ----------------------------------------------------------
     1080p EVEN IF >3.5 GB
  ---------------------------------------------------------- */

  const all1080 =
    pool.filter(
      is1080
    );


  if (
    all1080.length > 0
  ) {

    return [
      ...all1080
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


  /* ----------------------------------------------------------
     HIGHEST AVAILABLE RESOLUTION
  ---------------------------------------------------------- */

  const resolutionTorrents =
    pool.filter(
      torrent =>
        resolutionOf(torrent) > 0
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
        torrent =>
          resolutionOf(torrent) ===
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


  /* ----------------------------------------------------------
     FALLBACK
  ---------------------------------------------------------- */

  return [
    ...pool
  ].sort(
    (a, b) =>
      sizeOf(a) -
      sizeOf(b)
  )[0];
}


/* ============================================================
   EXTRACT MOVIE KEY
============================================================ */

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


/* ============================================================
   GET TORRENTS BY TAG
============================================================ */

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


/* ============================================================
   DELETE TORRENTS + FILES
============================================================ */

export async function deleteTorrents(
  hashes
) {

  if (
    !hashes ||
    !hashes.length
  ) {
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
   GET CURRENT MOVIE GROUP
============================================================ */

async function getCurrentMovieGroup(
  tag,
  movieKey
) {

  const currentTorrents =
    await getTorrentsByTag(
      tag
    );


  return currentTorrents.filter(
    torrent =>
      extractMovieKey(
        torrent.name
      ) === movieKey
  );
}


/* ============================================================
   METADATA READY
============================================================ */

function isMetadataReady(torrent) {

  if (!torrent) {
    return false;
  }


  const size =
    Number(torrent.size);


  return (
    Number.isFinite(size) &&
    size > 0 &&
    typeof torrent.name === "string" &&
    torrent.name.trim() !== ""
  );
}


/* ============================================================
   DELETE ONE TORRENT IMMEDIATELY
============================================================ */

async function deleteTorrentImmediately(
  torrent
) {

  if (
    !torrent ||
    !torrent.hash
  ) {
    return;
  }


  /*
   * PreDVD -> Radarr cleanup queue
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
          tag.trim().toLowerCase()
      )
      .includes("predvd")
  ) {

    await queueRadarrCleanup(
      torrent
    );
  }


  console.log(
    `🗑️ Deleting immediately: ${torrent.name}`
  );


  await publishMessage({
    message:
      `🗑️ Deleting immediately: ${torrent.name}`
  });


  await deleteTorrents([
    torrent.hash
  ]);
}


/* ============================================================
   PROCESS ONE MOVIE FOR ONE ROUND

   IMPORTANT:

   NEVER WAIT HERE.

   The movie gets ONE TURN.

   Metadata-ready torrents are evaluated immediately.

   Metadata-pending torrents remain untouched.

   Then the function returns and the next movie is processed.
============================================================ */

async function processMovieOnce(
  tag,
  movieKey,
  initialGroup
) {

  if (
    !initialGroup ||
    initialGroup.length === 0
  ) {

    return {
      processed: false,
      pending: false
    };
  }


  console.log("");
  console.log(
    "================================================="
  );


  console.log(
    `🎬 Processing: ${movieKey}`
  );


  console.log(
    `📦 Total torrents: ${initialGroup.length}`
  );


  /*
   * Analyze CURRENT metadata only.
   */

  const analyzedGroup =
    analyzeResolutions(
      initialGroup
    );


  /*
   * Separate ready and pending.
   */

  const metadataReady =
    analyzedGroup.filter(
      isMetadataReady
    );


  const metadataPending =
    analyzedGroup.filter(
      torrent =>
        !isMetadataReady(torrent)
    );


  console.log(
    `📊 Metadata ready: ${metadataReady.length}`
  );


  console.log(
    `⏳ Metadata pending: ${metadataPending.length}`
  );


  /*
   * ----------------------------------------------------------
   * NOTHING READY
   * ----------------------------------------------------------
   */

  if (
    metadataReady.length === 0
  ) {

    console.log(
      `⏳ ${movieKey}: no metadata-ready torrent yet.`
    );


    await publishMessage({
      message:
        `⏳ ${movieKey}: no metadata-ready torrent yet.`
    });


    return {
      processed: false,
      pending: true
    };
  }


  /*
   * ----------------------------------------------------------
   * SELECT BEST FROM CURRENTLY READY TORRENTS
   * ----------------------------------------------------------
   */

  const best =
    selectBestTorrent(
      metadataReady
    );


  if (!best) {

    return {
      processed: false,
      pending: metadataPending.length > 0
    };
  }


  console.log("");
  console.log(
    `🏆 Current best: ${best.name}`
  );


  await publishMessage({
    message:
      `🏆 Current best: ${best.name}`
  });


  /*
   * ----------------------------------------------------------
   * DELETE ONLY OTHER METADATA-READY TORRENTS
   *
   * NEVER DELETE size=0 torrents.
   * ----------------------------------------------------------
   */

  const losers =
    metadataReady.filter(
      torrent =>
        torrent.hash !== best.hash
    );


  console.log(
    `🧹 ${losers.length} inferior metadata-ready torrent(s) will be deleted.`
  );


  for (
    const loser
    of losers
  ) {

    await deleteTorrentImmediately(
      loser
    );
  }


  /*
   * ----------------------------------------------------------
   * PENDING TORRENTS ARE LEFT ALONE
   * ----------------------------------------------------------
   */

  if (
    metadataPending.length > 0
  ) {

    console.log(
      `⏳ ${movieKey}: keeping ${metadataPending.length} metadata-pending torrent(s).`
    );


    await publishMessage({
      message:
        `⏳ ${movieKey}: keeping ${metadataPending.length} metadata-pending torrent(s).`
    });


    return {
      processed: true,
      pending: true
    };
  }


  console.log(
    `✅ ${movieKey}: no metadata pending.`
  );


  return {
    processed: true,
    pending: false
  };
}


/* ============================================================
   CLEANUP TODAY TORRENTS

   NEW BEHAVIOR:

   1. Read all qBittorrent torrents.
   2. Group by movie.
   3. Sort movies by torrent count DESCENDING.
   4. Process EACH movie exactly once.
   5. NEVER wait for a movie.
   6. Metadata-ready losers are deleted immediately.
   7. Metadata-pending torrents stay untouched.
   8. Return false if another round is needed.
============================================================ */

export async function cleanupTodayTorrents() {

  const tag =
    "script";


  console.log("");
  console.log(
    "================================================="
  );
  console.log(
    "🧹 TORRENT CLEANUP ROUND"
  );
  console.log(
    "================================================="
  );


  await publishMessage({
    message:
      `🧹 Starting torrent cleanup round`
  });


  /*
   * ==========================================================
   * GET CURRENT TORRENTS
   * ==========================================================
   */

  const torrents =
    await getTorrentsByTag(
      tag
    );


  if (
    !torrents ||
    torrents.length === 0
  ) {

    console.log(
      "✅ No torrents found."
    );


    await publishMessage({
      message:
        "✅ No torrents found."
    });


    return true;
  }


  /*
   * ==========================================================
   * GROUP BY MOVIE
   * ==========================================================
   */

  const grouped = {};


  for (
    const torrent
    of torrents
  ) {

    const movieKey =
      extractMovieKey(
        torrent.name
      );


    if (
      !grouped[movieKey]
    ) {

      grouped[movieKey] = [];
    }


    grouped[movieKey].push(
      torrent
    );
  }


  /*
   * ==========================================================
   * SORT MOVIES BY NUMBER OF TORRENTS
   *
   * MOST CANDIDATES FIRST.
   *
   * This prevents one movie from blocking the others.
   * ==========================================================
   */

  // ============================================================
// ONLY PROCESS MOVIES WITH MORE THAN ONE TORRENT
// ============================================================

const movies =
  Object.entries(grouped)
    .filter(
      ([, group]) =>
        group.length > 1
    )
    .sort(
      ([, groupA], [, groupB]) =>
        groupB.length -
        groupA.length
    );


console.log("");
console.log(
  `📊 Total movie groups: ${Object.keys(grouped).length}`
);

console.log(
  `🎯 Movies requiring candidate selection: ${movies.length}`
);

console.log(
  `⏭️ Movies skipped because they have only 1 torrent: ${
    Object.keys(grouped).length - movies.length
  }`
);


console.log("");
console.log(
  "📊 MOVIES TO PROCESS:"
);


movies.forEach(
  ([movieKey, group], index) => {

    console.log(
      `${index + 1}. ${movieKey} → ${group.length} torrent(s)`
    );
  }
);



  await publishMessage({
    message:
      `📊 Processing ${movies.length} movie group(s)`
  });


  /*
   * ==========================================================
   * PROCESS EVERY MOVIE ONCE
   *
   * NO WAITING.
   * ==========================================================
   */

  let metadataPendingAnywhere =
    false;


for (
  const [movieKey]
  of movies
) {

  const currentGroup =
    await getCurrentMovieGroup(
      tag,
      movieKey
    );


  if (
    !currentGroup ||
    currentGroup.length <= 1
  ) {

    console.log(
      `⏭️ Skipping ${movieKey}: only 1 torrent remains.`
    );

    continue;
  }


  const result =
    await processMovieOnce(
      tag,
      movieKey,
      currentGroup
    );


  if (
    result.pending
  ) {

    metadataPendingAnywhere = true;
  }

  // NO WAIT HERE.
  // Immediately process the next movie.
}


  /*
   * ==========================================================
   * ROUND FINISHED
   * ==========================================================
   */

  console.log("");
  console.log(
    "================================================="
  );
  console.log(
    "🏁 CLEANUP ROUND FINISHED"
  );
  console.log(
    "================================================="
  );


  /*
   * ==========================================================
   * MORE METADATA NEEDED
   * ==========================================================
   */

  if (
    metadataPendingAnywhere
  ) {

    console.log(
      `⏳ Some movies still have metadata pending.`
    );


    console.log(
      `🔄 Next round will start after ${METADATA_RETRY_INTERVAL / 1000} seconds.`
    );


    await publishMessage({
      message:
        `⏳ Some movies still have metadata pending.`
    });


    /*
     * IMPORTANT:
     *
     * Wait ONLY after ALL movies have received
     * one turn.
     *
     * This is the key difference from the old logic.
     */

    await delay(
      METADATA_RETRY_INTERVAL,
      true
    );


    /*
     * Return false so the caller can run another
     * cleanup round.
     */

    return false;
  }


  /*
   * ==========================================================
   * EVERYTHING FINISHED
   * ==========================================================
   */

  console.log(
    "✅ All currently available torrent cleanup completed."
  );


  await publishMessage({
    message:
      "✅ All currently available torrent cleanup completed."
  });


  return true;
}