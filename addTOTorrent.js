import { initDB } from "./db/db.js";
import { loginQB, addMagnet } from "./qbittorrent/qb.js";

export async function addToTorrent() {
  try {
    const db = await initDB();

    const result = await db.query(`
      SELECT * FROM magnets
      WHERE created_at >= NOW() - INTERVAL '1 hours'
      ORDER BY created_at DESC
    `);

    const rows = result.rows;

    await loginQB();
    console.log("adding torrents");

    for (const value of rows) {
      await addMagnet(value.magnet);
    }

    console.log("adding complete");
  } catch (error) {
    console.error(error);
  }
}
