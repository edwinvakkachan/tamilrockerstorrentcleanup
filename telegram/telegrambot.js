import axios from "axios";
import dotenv from "dotenv";
import {initDB} from '../db/db.js'

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let lastUpdateId = 0;


// Send message
async function sendMessage(text) {
  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text
    }
  );
}


// Get updates
async function getUpdates() {
  const res = await axios.get(
    `https://api.telegram.org/bot${TOKEN}/getUpdates`,
    {
      params: { offset: lastUpdateId + 1 }
    }
  );

  return res.data.result;
}


// Handle commands
async function handleCommand(text) {
  const db = await initDB();

  if (text === "/domain") {
    const row = await db.get(
      "SELECT value FROM settings WHERE key='current_domain'"
    );
    await sendMessage(`Current Domain:\n${row.value}`);
  }

  else if (text.startsWith("/setdomain")) {
    const parts = text.split(" ");
    if (parts.length < 2) {
      return sendMessage("Usage:\n/setdomain https://example.com");
    }

    const newDomain = parts[1];

    await db.run(
      "UPDATE settings SET value=?, updated_at=CURRENT_TIMESTAMP WHERE key='current_domain'",
      newDomain
    );

    await sendMessage(`✅ Domain updated manually:\n${newDomain}`);
  }

  else if (text === "/status") {
    await sendMessage("🟢 Domain tracker running.");
  }

  else if (text === "/forcecheck") {
    await sendMessage("🔄 Manual domain check triggered.");
    // optionally call your checkDomain() here
  }
}


// Poll loop
export async function startTelegramBot() {
  console.log("Telegram bot started...");

  setInterval(async () => {
    const updates = await getUpdates();

    for (const update of updates) {
      lastUpdateId = update.update_id;

      if (update.message?.chat.id.toString() !== CHAT_ID) continue;

      const text = update.message.text;
      await handleCommand(text);
    }
  }, 3000);
}
