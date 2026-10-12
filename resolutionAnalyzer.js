
/*
 * resolutionAnalyzer.js
 *
 * Deterministic resolution analyzer.
 *
 * IMPORTANT:
 * Resolution explicitly present in the filename ALWAYS wins.
 *
 * If resolution is missing from the filename, use fixed file-size
 * thresholds. Do NOT build thresholds from other torrents.
 *
 * This prevents the same torrent from being classified differently
 * depending on which other torrents happen to be available.
 */


/* ============================================================
   FIXED SIZE THRESHOLDS
   ============================================================ */

/*
 * These are intentionally FIXED.
 *
 * They are only fallback classifications.
 * They do NOT claim that file size can determine the real
 * encoded resolution with certainty.
 *
 * Explicit filename resolution always has priority.
 *
 * Approximate:
 *
 * < 450 MB       -> 360p
 * 450 MB-700 MB  -> 480p
 * 700 MB-1.5 GB  -> 720p
 * >= 1.5 GB      -> 1080p
 *
 * These values can be adjusted later if your torrent collection
 * shows a different pattern.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

const SIZE_THRESHOLD_360 =
  450 * MB;

const SIZE_THRESHOLD_480 =
  700 * MB;

const SIZE_THRESHOLD_720 =
  1.5 * GB;


/* ============================================================
   EXTRACT EXPLICIT RESOLUTION
   ============================================================ */

export function extractResolution(name) {

  if (
    !name ||
    typeof name !== "string"
  ) {
    return 0;
  }

  /*
   * Match common resolution formats:
   *
   * 2160p
   * 1440p
   * 1080p
   * 720p
   * 576p
   * 480p
   * 360p
   */

  const match =
    name.match(
      /\b(2160|1440|1080|720|576|480|360)p\b/i
    );

  if (!match) {
    return 0;
  }

  return Number(
    match[1]
  );
}


/* ============================================================
   GET TORRENT SIZE
   ============================================================ */

function getTorrentSize(
  torrent
) {

  const size =
    Number(
      torrent?.size
    );

  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return 0;
  }

  return size;
}


/* ============================================================
   FIXED SIZE-BASED FALLBACK
   ============================================================
 *
 * IMPORTANT:
 *
 * This function does NOT inspect any other torrent.
 *
 * Therefore:
 *
 * 300 MB will ALWAYS produce the same result.
 * 500 MB will ALWAYS produce the same result.
 * 800 MB will ALWAYS produce the same result.
 *
 * A new 1080p torrent appearing later cannot change them.
 *
 * ============================================================
 */

export function inferResolutionFromSize(
  size
) {

  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return 0;
  }


  /*
   * Less than 450 MB
   */

  if (
    size < SIZE_THRESHOLD_360
  ) {

    return 360;
  }


  /*
   * 450 MB - 700 MB
   */

  if (
    size < SIZE_THRESHOLD_480
  ) {

    return 480;
  }


  /*
   * 700 MB - 1.5 GB
   */

  if (
    size < SIZE_THRESHOLD_720
  ) {

    return 720;
  }


  /*
   * 1.5 GB and above
   */

  return 1080;
}


/* ============================================================
   ANALYZE ONE TORRENT
   ============================================================ */

export function analyzeTorrent(
  torrent
) {

  if (!torrent) {
    return torrent;
  }


  /*
   * ------------------------------------------------------------
   * STEP 1
   *
   * Explicit resolution from filename.
   * ------------------------------------------------------------
   */

  const explicitResolution =
    extractResolution(
      torrent.name
    );


  if (
    explicitResolution > 0
  ) {

    return {
      ...torrent,

      inferredResolution:
        explicitResolution,

      resolutionSource:
        "filename"
    };
  }


  /*
   * ------------------------------------------------------------
   * STEP 2
   *
   * No resolution in filename.
   *
   * Use fixed size classification.
   * ------------------------------------------------------------
   */

  const size =
    getTorrentSize(
      torrent
    );


  const inferredResolution =
    inferResolutionFromSize(
      size
    );


  console.log(
    `🔍 Inferred resolution: ` +
    `${inferredResolution > 0
      ? inferredResolution + "p"
      : "unknown"} | ` +
    `${torrent.name} | ` +
    `size=${size}`
  );


  return {
    ...torrent,

    inferredResolution,

    resolutionSource:
      inferredResolution > 0
        ? "fixed-size-analysis"
        : "unknown"
  };
}


/* ============================================================
   ANALYZE COMPLETE TORRENT LIST
   ============================================================
 *
 * NOTE:
 *
 * The torrents argument is retained for compatibility with the
 * existing code.
 *
 * We deliberately DO NOT compare torrents against each other.
 *
 * This is the key change that makes the result deterministic.
 *
 * ============================================================
 */

export function analyzeResolutions(
  torrents
) {

  if (
    !Array.isArray(torrents)
  ) {

    return [];
  }


  if (
    torrents.length === 0
  ) {

    return [];
  }


  console.log(
    "\n📊 Resolution analysis:"
  );

  console.log(
    "Using fixed size thresholds " +
    "(no cross-torrent profile)"
  );

  console.log(
    `360p  : < ${Math.round(
      SIZE_THRESHOLD_360 / MB
    )} MB`
  );

  console.log(
    `480p  : ${Math.round(
      SIZE_THRESHOLD_360 / MB
    )} MB - < ${Math.round(
      SIZE_THRESHOLD_480 / MB
    )} MB`
  );

  console.log(
    `720p  : ${Math.round(
      SIZE_THRESHOLD_480 / MB
    )} MB - < ${(
      SIZE_THRESHOLD_720 / GB
    ).toFixed(2)} GB`
  );

  console.log(
    `1080p : >= ${(
      SIZE_THRESHOLD_720 / GB
    ).toFixed(2)} GB`
  );


  /*
   * Analyze every torrent independently.
   */

  return torrents.map(
    torrent =>
      analyzeTorrent(
        torrent
      )
  );
}


/* ============================================================
   GET ANALYZED RESOLUTION
   ============================================================ */

export function getAnalyzedResolution(
  torrent
) {

  if (!torrent) {
    return 0;
  }


  /*
   * First use the value generated by the analyzer.
   */

  const inferred =
    Number(
      torrent.inferredResolution
    );


  if (
    Number.isFinite(inferred) &&
    inferred > 0
  ) {

    return inferred;
  }


  /*
   * Then check the filename directly.
   */

  const explicit =
    extractResolution(
      torrent.name
    );


  if (
    explicit > 0
  ) {

    return explicit;
  }


  /*
   * Finally use the fixed size fallback.
   */

  const size =
    getTorrentSize(
      torrent
    );


  return inferResolutionFromSize(
    size
  );
}


/* ============================================================
   OPTIONAL DEBUG HELPER
   ============================================================ */

export function getResolutionSource(
  torrent
) {

  if (!torrent) {
    return "unknown";
  }


  if (
    torrent.resolutionSource
  ) {

    return torrent.resolutionSource;
  }


  if (
    extractResolution(
      torrent.name
    ) > 0
  ) {

    return "filename";
  }


  if (
    getTorrentSize(
      torrent
    ) > 0
  ) {

    return "fixed-size-analysis";
  }


  return "unknown";
}

