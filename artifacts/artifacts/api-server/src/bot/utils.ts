import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { CONFIG } from "./config";

let cachedBotId: number | null = null;
const adminCache = new Map<number, { admins: Set<number>; ts: number }>();

export function getDisplayName(user: TelegramBot.User): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.username || String(user.id);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function getBotId(bot: TelegramBot): Promise<number> {
  if (cachedBotId) return cachedBotId;
  const me = await bot.getMe();
  cachedBotId = me.id;
  return cachedBotId;
}

export async function getGroupAdmins(
  bot: TelegramBot,
  chatId: number
): Promise<Set<number>> {
  const cached = adminCache.get(chatId);
  if (cached && Date.now() - cached.ts < CONFIG.ADMIN_CACHE_TTL_MS) {
    return cached.admins;
  }
  try {
    const admins = await bot.getChatAdministrators(chatId);
    const ids = new Set(admins.map((a) => a.user.id));
    adminCache.set(chatId, { admins: ids, ts: Date.now() });
    return ids;
  } catch {
    return cached?.admins ?? new Set();
  }
}

export function invalidateAdminCache(chatId: number): void {
  adminCache.delete(chatId);
}

export async function deleteMessageSafe(
  bot: TelegramBot,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch {
    // silently ignore — message may already be gone
  }
}

export async function sendAutoDelete(
  bot: TelegramBot,
  chatId: number,
  text: string,
  delayMs: number = CONFIG.WARNING_AUTO_DELETE_MS
): Promise<void> {
  try {
    const msg = await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    setTimeout(() => deleteMessageSafe(bot, chatId, msg.message_id), delayMs);
  } catch (err) {
    logger.warn({ err }, "sendAutoDelete failed");
  }
}

export async function isBotAdmin(
  bot: TelegramBot,
  chatId: number
): Promise<boolean> {
  try {
    const botId = await getBotId(bot);
    const admins = await getGroupAdmins(bot, chatId);
    return admins.has(botId);
  } catch {
    return false;
  }
}

export function parseUserArg(text: string): number | null {
  const match = text.match(/(\d{5,})/);
  if (match) return parseInt(match[1], 10);
  return null;
}
