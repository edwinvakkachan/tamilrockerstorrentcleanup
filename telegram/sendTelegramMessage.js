import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  throw new Error("Telegram environment variables missing");
}

const telegram = axios.create({
  baseURL: `https://api.telegram.org/bot${TOKEN}`,
  timeout: 10000, // 10 seconds
});

export async function sendMessage(text) {
  try {
    const response = await telegram.post("/sendMessage", {
      chat_id: CHAT_ID,
      text,
    });

    return response.data;

  } catch (error) {
    console.error("Telegram send failed:", error.message);

    // Do NOT rethrow if you don't want app to crash
    return null;
  }
}
