import axios from "axios";
import { delay } from "../delay.js";

const HA_WEBHOOK_URL = process.env.HA_WEBHOOK_URL; 

// Example: http://192.168.0.50:8123/api/webhook/your_webhook_id

export async function triggerHomeAssistantWebhook(payload = {}) {
  try {
    if (!HA_WEBHOOK_URL) {
      console.warn("⚠️ HA_WEBHOOK_URL not set in .env");
      return;
    }

    const response = await axios.post(HA_WEBHOOK_URL,{
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
await delay(10000,true)

console.log("✅ Home Assistant webhook triggered:", response.status);
return ;
  } catch (error) {
    console.error("❌ Failed to trigger Home Assistant webhook");
        await publishMessage({
      message: "❌ Failed to trigger Home Assistant webhook for files to traktv db add"
    });
    console.error(error.message);
  }
}


export async function triggerHAWebhookWhenErrorOccurs(errorMessage="") {
  try {
    await axios.post(
      `${config.HA_WEBHOOKError_URL}`,
      
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    console.log("🏠 Home Assistant webhook triggered for running again");
    // await sendTelegramMessage("🏠 Home Assistant webhook triggered")
    await delay(10000,true);
    return;
  } catch (err) {
    console.error("⚠️ Failed to trigger HA webhook ERROR url:", err.message);
    await sendTelegramMessage("⚠️ Failed to trigger HA webhook ERROR url")
  }
}
