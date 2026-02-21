import axios from "axios";

const HA_WEBHOOK_URL = process.env.HA_WEBHOOK_URL; 
// Example: http://192.168.0.50:8123/api/webhook/your_webhook_id

export async function triggerHomeAssistantWebhook(payload = {}) {
  try {
    if (!HA_WEBHOOK_URL) {
      console.warn("⚠️ HA_WEBHOOK_URL not set in .env");
      return;
    }

    const response = await axios.post(HA_WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    console.log("✅ Home Assistant webhook triggered:", response.status);
  } catch (error) {
    console.error("❌ Failed to trigger Home Assistant webhook");
    console.error(error.message);
  }
}