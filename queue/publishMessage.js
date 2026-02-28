import pool from "../db/pool.js";
import { retry } from "../homeassitant/RetryWrapper.js";
import { triggerHomeAssistantWebhookWhenErrorOccurs } from "../homeassitant/homeAssistantWebhook.js";


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

 try {
   await pool.query(
     `
     INSERT INTO app_message_queue
     (source_app, event_type, payload, target, scheduled_at)
     VALUES ($1,$2,$3,$4, COALESCE($5, CURRENT_TIMESTAMP))
     `,
     [sourceApp, eventType, payload, target, scheduledAt]
   );
 } catch (error) {
  console.error('queue message errror',error);
      await retry(
    triggerHomeAssistantWebhookWhenErrorOccurs,
    { status: "error" },
    "homeassistant-error",
    5
  );
 }
}