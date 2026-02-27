import pool from "../db/pool.js";

export async function publishMessage({
  message,
  sourceApp = "unknown",
  eventType = "info",
  target = "telegram",
  scheduledAt = null,
  extra = {}
}) {
  if (!message) {
    throw new Error("Message is required");
  }

  const payload = {
    message,
    ...extra,
    time: new Date().toISOString()
  };

  await pool.query(
    `
    INSERT INTO app_message_queue
    (source_app, event_type, payload, target, scheduled_at)
    VALUES ($1,$2,$3,$4, COALESCE($5, CURRENT_TIMESTAMP))
    `,
    [sourceApp, eventType, payload, target, scheduledAt]
  );
}