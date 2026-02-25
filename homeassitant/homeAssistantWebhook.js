import axios from "axios";
import { delay } from "../delay.js";
import { sendMessage } from "../telegram/sendTelegramMessage.js";

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
await delay(5000,true)

    console.log("✅ Home Assistant webhook triggered:", response.status);
  } catch (error) {
    console.error("❌ Failed to trigger Home Assistant webhook");
    await sendMessage("❌ Failed to trigger Home Assistant webhook for files to traktv db add");
    console.error(error.message);
  }
}


export async function triggerHAWebhookWhenErrorOccurs(errorMessage="") {
  try {
    await axios.post(
      `${config.HA_WEBHOOKError_URL}`,
      {
        status: "error",
        message: errorMessage,
        time: new Date().toISOString()
      },
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 5000
      }
    );

    console.log("🏠 Home Assistant webhook triggered for running again");
    // await sendTelegramMessage("🏠 Home Assistant webhook triggered")
  } catch (err) {
    console.error("⚠️ Failed to trigger HA webhook ERROR url:", err.message);
    await sendTelegramMessage("⚠️ Failed to trigger HA webhook ERROR url")
  }
}
