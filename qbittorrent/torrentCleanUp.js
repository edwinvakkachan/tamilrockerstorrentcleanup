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
  if (!torrents.length) {
    return null;
  }

  /*
   * TV torrents:
   * Keep existing TV-specific selection.
   */
  const tvTorrents = torrents.filter(t =>
    isTVShow(t.name)
  );

  if (tvTorrents.length > 0) {
    const sortedTV = sortTVTorrents(tvTorrents);

    if (sortedTV.length > 0) {
      return sortedTV[0];
    }
  }

  /*
   * MOVIE SELECTION RULES
   *
   * 1. Prefer Malayalam.
   *
   * 2. Prefer 1080p <= 3.5 GB.
   *    Choose the smallest qualifying 1080p.
   *
   * 3. If no 1080p <= 3.5 GB exists:
   *    If 720p exists, use 720p.
   *
   * 4. For 720p:
   *    Prefer the largest file <= 2 GB.
   *
   * 5. If 720p exists but every 720p file is >2 GB:
   *    choose the smallest 720p.
   *
   * 6. If no 720p exists:
   *    keep 1080p even if it is >3.5 GB.
   *
   * 7. If neither 1080p nor 720p exists:
   *    choose the highest available resolution.
   *
   * Examples:
   *
   * 1080p 1.8GB + 1080p 3.3GB
   * -> 1080p 1.8GB
   *
   * 1080p 4GB + 720p 2GB + 720p 1.5GB
   * -> 720p 2GB
   *
   * 1080p 4GB + 480p 720MB
   * -> 1080p 4GB
   *
   * 4K 7GB + 480p 720MB
   * -> 4K 7GB
   */

  /*
   * Remove PreDVD when a normal release exists.
   */
  const nonPreDVD = torrents.filter(
    t => !isPreDVD(t.name)
  );

  const candidates =
    nonPreDVD.length > 0
      ? nonPreDVD
      : torrents;

  /*
   * Prefer Malayalam.
   */
  const malayalamTorrents = candidates.filter(t =>
    isMalayalam(t.name)
  );

  const pool =
    malayalamTorrents.length > 0
      ? malayalamTorrents
      : candidates;

  /*
   * --------------------------------------------------
   * 1080p
   * --------------------------------------------------
   */

  const torrents1080 = pool.filter(t =>
    getResolutionValue(t.name) === 1080
  );

  if (torrents1080.length > 0) {

    /*
     * First choice:
     *
     * 1080p <= 3.5 GB
     *
     * Choose the smallest file.
     */
    const suitable1080 = torrents1080.filter(t =>
      getTorrentSize(t) <= 3.5 * 1024 * 1024 * 1024
    );

    if (suitable1080.length > 0) {
      return sortByLanguageAndSize(
        suitable1080
      )[0];
    }

    /*
     * No suitable 1080p.
     *
     * Check 720p before accepting a large 1080p.
     */
    const torrents720 = pool.filter(t =>
      getResolutionValue(t.name) === 720
    );

    if (torrents720.length > 0) {

      /*
       * Prefer 720p <= 2 GB.
       *
       * Choose the largest file up to 2 GB.
       */
      const suitable720 = torrents720.filter(t =>
        getTorrentSize(t) <=
        2 * 1024 * 1024 * 1024
      );

      if (suitable720.length > 0) {

        return [...suitable720].sort(
          (a, b) => {

            const sizeDiff =
              getTorrentSize(b) -
              getTorrentSize(a);

            if (sizeDiff !== 0) {
              return sizeDiff;
            }

            /*
             * Same size:
             * Prefer HEVC/x265.
             */
            const aHevc =
              /hevc|x265/i.test(a.name);

            const bHevc =
              /hevc|x265/i.test(b.name);

            if (aHevc !== bHevc) {
              return bHevc ? 1 : -1;
            }

            return 0;
          }
        )[0];
      }

      /*
       * 720p exists, but every 720p file
       * is above 2 GB.
       *
       * Choose the smallest 720p.
       */
      return [...torrents720].sort(
        (a, b) => {

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

          return 0;
        }
      )[0];
    }

    /*
     * No 720p exists.
     *
     * Keep 1080p even if it is >3.5 GB.
     */
    return sortByLanguageAndSize(
      torrents1080
    )[0];
  }

  /*
   * --------------------------------------------------
   * No 1080p
   * --------------------------------------------------
   */

  const torrents720 = pool.filter(t =>
    getResolutionValue(t.name) === 720
  );

  if (torrents720.length > 0) {

    /*
     * Prefer largest 720p up to 2 GB.
     */
    const suitable720 = torrents720.filter(t =>
      getTorrentSize(t) <=
      2 * 1024 * 1024 * 1024
    );

    if (suitable720.length > 0) {

      return [...suitable720].sort(
        (a, b) => {

          const sizeDiff =
            getTorrentSize(b) -
            getTorrentSize(a);

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

          return 0;
        }
      )[0];
    }

    /*
     * 720p exists but all files are >2 GB.
     * Choose the smallest 720p.
     */
    return [...torrents720].sort(
      (a, b) => {

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

        return 0;
      }
    )[0];
  }

  /*
   * --------------------------------------------------
   * No 1080p or 720p
   * --------------------------------------------------
   *
   * Choose the HIGHEST available resolution.
   *
   * Example:
   *
   * 4K 7GB
   * 480p 720MB
   *
   * -> 4K 7GB
   */

  const resolutions = pool
    .map(t =>
      getResolutionValue(t.name)
    )
    .filter(r => r > 0);

  if (resolutions.length > 0) {

    const highestResolution =
      Math.max(...resolutions);

    const highestResolutionTorrents =
      pool.filter(t =>
        getResolutionValue(t.name) ===
        highestResolution
      );

    /*
     * Same highest resolution:
     * choose smallest file.
     */
    return [...highestResolutionTorrents].sort(
      (a, b) => {

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

        return 0;
      }
    )[0];
  }

  /*
   * No recognizable resolution.
   */
  return sortByLanguageAndSize(pool)[0];
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