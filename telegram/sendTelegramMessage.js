import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;




// Send message
export async function sendMessage(text) {
  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text
    }
  );
}
