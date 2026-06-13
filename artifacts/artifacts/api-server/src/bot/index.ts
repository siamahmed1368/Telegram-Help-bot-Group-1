import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { loadStore } from "./store";
import { registerHandlers } from "./handlers";
import { registerCommands } from "./commands";

const token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required.");
}

loadStore();

const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10, allowed_updates: ["message", "chat_member", "my_chat_member"] },
  },
});

registerHandlers(bot);
registerCommands(bot);

bot.on("polling_error", (err: any) => {
  // Suppress 409 conflict (duplicate polling) and 403 stale errors silently
  if (err?.code === "ETELEGRAM") {
    const code = err?.response?.body?.error_code;
    if (code === 409 || code === 403) return;
  }
  logger.error({ err }, "Telegram polling error");
});

bot.on("error", (err) => {
  logger.error({ err }, "Telegram bot error");
});

logger.info("🤖 Telegram Group Guard bot started.");

export default bot;
