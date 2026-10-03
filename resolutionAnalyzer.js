
// resolutionAnalyzer.js

/*
 * ============================================================
 * RESOLUTION ANALYZER
 * ============================================================
 *
 * Purpose:
 *
 * 1. Read resolution directly from torrent filename when present.
 *
 * 2. For torrents without a resolution in the filename,
 *    analyze OTHER torrents from the SAME movie group.
 *
 * 3. Build a size profile such as:
 *
 *      720p  -> 1.1GB - 1.7GB
 *      1080p -> 2.0GB - 3.3GB
 *
 * 4. Use those profiles to infer resolution only when there
 *    is enough evidence.
 *
 * 5. DO NOT automatically classify a small file as 720p just
 *    because it is smaller than a known 1080p file.
 *
 * Example:
 *
 *      1080p -> 2GB, 3.3GB
 *      720p  -> 1.1GB, 1.7GB
 *
 *      800MB -> unknown
 *      500MB -> unknown
 *      300MB -> unknown
 *
 * This is intentional.
 *
 * ============================================================
 */

const KNOWN_RESOLUTIONS = [
  2160,
  1440,
  1080,
  720,
  576,
  480,
  360
];


/* ============================================================
   Extract resolution directly from filename
   ============================================================ */

export function extractResolution(name) {

  if (
    !name ||
    typeof name !== "string"
  ) {
    return 0;
  }

  const match = name.match(
    /\b(2160p|1440p|1080p|720p|576p|480p|360p)\b/i
  );

  if (!match) {
    return 0;
  }

  return Number(
    match[1].replace(/p$/i, "")
  );
}


/* ============================================================
   Get qBittorrent actual file size
   ============================================================ */

function getSize(torrent) {

  const size = Number(
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
   Median
   ============================================================ */

function median(values) {

  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const middle =
    Math.floor(sorted.length / 2);

  if (
    sorted.length % 2 === 0
  ) {

    return (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2;
  }

  return sorted[middle];
}


/* ============================================================
   Build resolution profile
   ============================================================
 *
 * ONLY torrents with an explicitly known resolution are used
 * to construct the profile.
 *
 * Unknown torrents are NEVER used as references.
 *
 * ============================================================
 */

function buildResolutionProfile(torrents) {

  const profile = {};

  for (
    const resolution
    of KNOWN_RESOLUTIONS
  ) {

    const sizes = torrents
      .filter(t =>
        extractResolution(
          t?.name
        ) === resolution
      )
      .map(getSize)
      .filter(size =>
        size > 0
      );

    if (!sizes.length) {
      continue;
    }

    profile[resolution] = {

      min:
        Math.min(...sizes),

      max:
        Math.max(...sizes),

      median:
        median(sizes),

      count:
        sizes.length,

      sizes
    };
  }

  return profile;
}


/* ============================================================
   Print profile
   ============================================================ */

function printResolutionProfile(profile) {

  console.log(
    "\n📊 Resolution size profile:"
  );

  const resolutions =
    Object.keys(profile)
      .map(Number)
      .sort((a, b) => a - b);

  if (!resolutions.length) {

    console.log(
      "No known resolution torrents available for analysis."
    );

    return;
  }

  for (
    const resolution
    of resolutions
  ) {

    const data =
      profile[resolution];

    console.log(
      `${resolution}p -> ` +
      `min=${data.min} ` +
      `max=${data.max} ` +
      `median=${Math.round(data.median)} ` +
      `count=${data.count}`
    );
  }
}


/* ============================================================
   Infer resolution from size
   ============================================================
 *
 * IMPORTANT:
 *
 * We only infer when there is sufficient evidence.
 *
 * We DO NOT do this:
 *
 *      1080p exists
 *      file is smaller
 *      therefore file = 720p
 *
 * That was causing the previous problem.
 *
 * ============================================================
 */

function inferFromSize(
  torrent,
  profile
) {

  const size =
    getSize(torrent);

  if (!size) {
    return 0;
  }

  const known =
    Object.entries(profile)
      .map(
        ([resolution, data]) => ({
          resolution:
            Number(resolution),

          ...data
        })
      )
      .sort(
        (a, b) =>
          a.median - b.median
      );

  if (!known.length) {
    return 0;
  }


  /* ----------------------------------------------------------
     CASE 1
     Size falls directly inside a known resolution range.
     ---------------------------------------------------------- */

  const rangeMatches =
    known.filter(item =>
      size >= item.min &&
      size <= item.max
    );

  if (rangeMatches.length > 0) {

    return rangeMatches.sort(
      (a, b) =>
        Math.abs(
          size - a.median
        ) -
        Math.abs(
          size - b.median
        )
    )[0].resolution;
  }


  /* ----------------------------------------------------------
     CASE 2
     Size falls between two known resolution ranges.
     ---------------------------------------------------------- */

  for (
    let i = 0;
    i < known.length - 1;
    i++
  ) {

    const lower =
      known[i];

    const higher =
      known[i + 1];

    if (
      size > lower.max &&
      size < higher.min
    ) {

      const distanceToLower =
        Math.abs(
          size - lower.median
        );

      const distanceToHigher =
        Math.abs(
          size - higher.median
        );

      /*
       * Only infer if the file is reasonably close
       * to one of the known resolution profiles.
       *
       * This prevents a 300MB file from suddenly
       * becoming 720p just because 720p is the
       * lowest known resolution.
       */

      const closest =
        distanceToLower <=
        distanceToHigher
          ? lower
          : higher;

      const closestDistance =
        Math.min(
          distanceToLower,
          distanceToHigher
        );

      /*
       * Require the size to be reasonably close to
       * the known profile.
       *
       * Maximum allowed distance:
       * 60% of the closest profile median.
       */

      const maximumDistance =
        closest.median * 0.60;

      if (
        closestDistance <=
        maximumDistance
      ) {

        return closest.resolution;
      }

      return 0;
    }
  }


  /* ----------------------------------------------------------
     CASE 3
     Smaller than every known resolution.
     ----------------------------------------------------------
     
     DO NOT invent a resolution.

     Example:

         Known:
         720p = 1.1GB - 1.7GB

         Unknown:
         300MB

     Result:

         unknown
     ---------------------------------------------------------- */

  if (
    size <
    known[0].min
  ) {

    return 0;
  }


  /* ----------------------------------------------------------
     CASE 4
     Larger than every known resolution.
     ----------------------------------------------------------
     
     DO NOT invent a higher resolution.
     ---------------------------------------------------------- */

  if (
    size >
    known[known.length - 1].max
  ) {

    return 0;
  }


  return 0;
}


/* ============================================================
   Analyze complete movie group
   ============================================================
 *
 * IMPORTANT:
 *
 * This function MUST receive the ORIGINAL COMPLETE group.
 *
 * Example:
 *
 *      analyzeResolutions(group)
 *
 * NOT:
 *
 *      analyzeResolutions(metadataReady)
 *
 * NOT:
 *
 *      analyzeResolutions(pool)
 *
 * NOT:
 *
 *      analyzeResolutions(nonPreDVD)
 *
 * The analyzer needs the entire group to establish the
 * correct size profile.
 *
 * ============================================================
 */

export function analyzeResolutions(
  torrents
) {

  if (
    !Array.isArray(torrents) ||
    torrents.length === 0
  ) {

    return [];
  }


  /*
   * Build profile from the COMPLETE group.
   */

  const profile =
    buildResolutionProfile(
      torrents
    );


  /*
   * Show profile in console.
   */

  printResolutionProfile(
    profile
  );


  /*
   * Analyze every torrent.
   */

  return torrents.map(
    torrent => {

      /*
       * First check the filename.
       */

      const actualResolution =
        extractResolution(
          torrent?.name
        );


      /*
       * ------------------------------------------------------
       * Resolution explicitly present.
       * ------------------------------------------------------
       *
       * NEVER override it.
       */

      if (
        actualResolution > 0
      ) {

        return {

          ...torrent,

          inferredResolution:
            actualResolution,

          resolutionSource:
            "filename"
        };
      }


      /*
       * ------------------------------------------------------
       * Resolution missing.
       * ------------------------------------------------------
       *
       * Try size analysis.
       */

      const inferredResolution =
        inferFromSize(
          torrent,
          profile
        );


      console.log(
        `🔍 Inferred resolution: ` +
        `${inferredResolution > 0
          ? inferredResolution + "p"
          : "unknown"} | ` +
        `${torrent.name}`
      );


      return {

        ...torrent,

        inferredResolution,

        resolutionSource:
          inferredResolution > 0
            ? "size-analysis"
            : "unknown"
      };
    }
  );
}


/* ============================================================
   Get analyzed resolution
   ============================================================ */

export function getAnalyzedResolution(
  torrent
) {

  /*
   * Prefer the value produced by the analyzer.
   */

  const inferred =
    Number(
      torrent?.inferredResolution
    );

  if (
    Number.isFinite(inferred) &&
    inferred > 0
  ) {

    return inferred;
  }


  /*
   * Otherwise read directly from filename.
   */

  return extractResolution(
    torrent?.name
  );
}
