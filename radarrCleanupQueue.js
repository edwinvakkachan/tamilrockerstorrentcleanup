import pool from "./db/pool.js";

/**
 * Add a movie to radarr_cleanup_queue when its PreDVD torrent
 * is deleted from qBittorrent.
 *
 * @param {object} torrent - qBittorrent torrent object
 * @returns {Promise<boolean>}
 */
export async function queueRadarrCleanup(torrent) {
  try {
    if (!torrent || !torrent.name) {
      console.log(
        "⚠️ Cannot queue Radarr cleanup: torrent name is missing"
      );
      return false;
    }

    const name = torrent.name.trim();

    // Only process PreDVD torrents
    if (!/\bpredvd\b/i.test(name)) {
      return false;
    }

    // Only process torrents carrying the predvdtag
    const tags = String(torrent.tags || "")
      .split(",")
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean);

    if (!tags.includes("predvd")) {
      console.log(
        `ℹ️ PreDVD torrent does not have predvdtag: ${name}`
      );
      return false;
    }

    /*
     * Extract the movie title and year.
     *
     * Examples:
     *
     * Movie Name (2026) PreDVD
     * Movie.Name.2026.PreDVD
     * Movie Name - 2026 - PreDVD
     */

    let title = null;
    let year = null;

    // First try: Movie Name (2026)
    let match = name.match(
      /^(.+?)\s*\((\d{4})\)/i
    );

    if (match) {
      title = match[1].trim();
      year = Number(match[2]);
    }

    // Second try: Movie.Name.2026
    if (!title || !year) {
      match = name.match(
        /^(.+?)[.\s_-]+(19\d{2}|20\d{2})(?:[.\s_-]|$)/i
      );

      if (match) {
        title = match[1]
          .replace(/[._]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        year = Number(match[2]);
      }
    }

    // Third try: find the year anywhere before PreDVD
    if (!title || !year) {
      const yearMatch = name.match(
        /\b(19\d{2}|20\d{2})\b/
      );

      if (yearMatch) {
        year = Number(yearMatch[1]);

        const beforeYear = name
          .substring(0, yearMatch.index)
          .replace(/[._-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        title = beforeYear;
      }
    }

    if (!title || !year) {
      console.log(
        `⚠️ Could not extract movie title/year from PreDVD torrent: ${name}`
      );

      return false;
    }

    /*
     * Remove common release-site prefixes.
     *
     * Example:
     * "www.1TamilMV.Li - Movie Name"
     * -> "Movie Name"
     */
    title = title
      .replace(/^www\.[^-]+-\s*/i, "")
      .replace(/^\[[^\]]+\]\s*/i, "")
      .trim();

    if (!title) {
      console.log(
        `⚠️ Empty movie title extracted from: ${name}`
      );

      return false;
    }

    /*
     * Insert into queue.
     *
     * If the same movie/year already exists:
     * - keep the existing row
     * - reset processed=false
     * - update created_at
     *
     * This means a newly deleted PreDVD release will be
     * processed again if the movie was previously handled.
     */
    const query = `
      INSERT INTO public.radarr_cleanup_queue
        (title, year, processed, created_at)
      VALUES
        ($1, $2, false, now())
      ON CONFLICT (title, year)
      DO UPDATE SET
        processed = false,
        created_at = now()
      RETURNING id, title, year, processed;
    `;

    const result = await pool.query(query, [
      title,
      year
    ]);

    const row = result.rows[0];

    console.log(
      `🧹 Added to Radarr cleanup queue: ${row.title} (${row.year})`
    );

    return true;

  } catch (error) {
    console.error(
      `❌ Failed to queue Radarr cleanup for "${torrent?.name}":`,
      error.message
    );

    return false;
  }
}