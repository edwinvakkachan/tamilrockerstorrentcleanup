import axios from "axios";
import { delay } from "../delay.js";

const HA_WEBHOOK_URL = process.env.HA_WEBHOOK_URL; 
const HA_WEBHOOKError_URL = process.env.HA_WEBHOOKError_URL;

// Example: http://192.168.0.50:8123/api/webhook/your_webhook_id

export async function triggerHomeAssistantWebhook(payload = {}) {
  if (!HA_WEBHOOK_URL) {
    throw new Error("HA_WEBHOOK_URL not set");
  }

  try {
    const response = await axios.post(
      HA_WEBHOOK_URL,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }
    );

    console.log("✅ Home Assistant webhook triggered:", response.status);
    return response.data;

  } catch (error) {
    console.error("❌ Failed to trigger Home Assistant webhook:", error.message);
    throw error;   // REQUIRED
  }
}


export async function triggerHomeAssistantWebhookWhenErrorOccurs(payload = {}) {
 
  if (!HA_WEBHOOKError_URL) {
    throw new Error("HA_WEBHOOKError_URL not set");
  }

  try {
    const response = await axios.post(
      HA_WEBHOOKError_URL,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }
    );

    console.log("✅ Home Assistant webhook Error URL triggered:", response.status);
    return response.data;

  } catch (error) {
    console.error("❌ Failed to trigger Home Assistant webhook Error URL :", error.message);
    throw error;   // REQUIRED
  }
}
