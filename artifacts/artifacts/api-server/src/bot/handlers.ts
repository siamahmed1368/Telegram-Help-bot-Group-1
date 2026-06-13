import TelegramBot from "node-telegram-bot-api";
import { CONFIG, FULLY_RESTRICTED, LINK_REGEX } from "./config";
import { getUser, addInvites, addWarning, updateUser, setMuted } from "./store";
import {
  getDisplayName,
  formatDate,
  formatTime,
  deleteMessageSafe,
  sendAutoDelete,
  getGroupAdmins,
  isBotAdmin,
  getBotId,
} from "./utils";
import { isFlooding } from "./flood";
import { logger } from "../lib/logger";

async function muteUser(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  hours: number = CONFIG.MUTE_DURATION_HOURS
): Promise<Date> {
  const unmuteDate = new Date(Date.now() + hours * 3600000);
  try {
    await bot.restrictChatMember(chatId, userId, {
      permissions: FULLY_RESTRICTED,
      until_date: Math.floor(unmuteDate.getTime() / 1000),
    });
    setMuted(userId, unmuteDate.getTime());
  } catch (err) {
    logger.warn({ err }, "Could not mute user");
  }
  return unmuteDate;
}

export function registerHandlers(bot: TelegramBot): void {
  // ── নতুন সদস্য যোগ দিলে ────────────────────────────────────────────
  bot.on("new_chat_members", async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.new_chat_members) return;

    await deleteMessageSafe(bot, chatId, msg.message_id);

    for (const newMember of msg.new_chat_members) {
      if (newMember.is_bot) continue;
      const name = getDisplayName(newMember);
      updateUser(newMember.id, {
        username: newMember.username,
        firstName: newMember.first_name,
        joinedAt: Date.now(),
      });

      try {
        await bot.sendMessage(
          chatId,
          `🎉 <b>${CONFIG.GROUP_NAME}</b>-এ স্বাগতম, <a href="tg://user?id=${newMember.id}">${name}</a>!\n\n` +
            `💸 পেইড গ্রুপ কিনতে ইনবক্স করুন: ${CONFIG.PROMO_USERNAME}\n` +
            `⚠️ গ্রুপে টেক্সট করতে আরও <b>৩ জনকে</b> অ্যাড করুন!`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.warn({ err }, "Could not send welcome message");
      }
    }

    // ইনভাইটারকে ক্রেডিট দাও
    if (msg.from && !msg.from.is_bot) {
      const count = msg.new_chat_members.filter((m) => !m.is_bot).length;
      if (count > 0) {
        const updated = addInvites(msg.from.id, count);
        logger.info(
          { userId: msg.from.id, total: updated.invites },
          "Invite credit added"
        );
        // চ্যাট আনলক হলে জানাও
        if (
          updated.invites >= CONFIG.REQUIRED_INVITES &&
          updated.invites - count < CONFIG.REQUIRED_INVITES
        ) {
          await sendAutoDelete(
            bot,
            chatId,
            `🎊 <a href="tg://user?id=${msg.from.id}">${getDisplayName(msg.from)}</a> ৩ জনকে অ্যাড করে চ্যাট অ্যাক্সেস আনলক করেছেন! অভিনন্দন! 🎉`,
            15000
          );
        }
      }
    }
  });

  // ── সদস্য চলে গেলে ──────────────────────────────────────────────────
  bot.on("left_chat_member", async (msg) => {
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
  });

  // ── সব মেসেজ ─────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.from) return;
    if (msg.chat.type === "private") return;
    if (msg.new_chat_members || msg.left_chat_member) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;

    if (!(await isBotAdmin(bot, chatId))) return;

    const text = msg.text ?? msg.caption ?? "";
    if (text.startsWith("/")) return;

    const admins = await getGroupAdmins(bot, chatId);
    const botId = await getBotId(bot);

    if (admins.has(userId) || userId === botId) return;

    const user = getUser(userId);
    updateUser(userId, {
      username: msg.from.username,
      firstName: msg.from.first_name,
    });

    // ── ১. ইনভাইট ওয়াল ──────────────────────────────────────────────
    if (user.invites < CONFIG.REQUIRED_INVITES) {
      await deleteMessageSafe(bot, chatId, messageId);
      const remaining = CONFIG.REQUIRED_INVITES - user.invites;
      const name = getDisplayName(msg.from);
      await sendAutoDelete(
        bot,
        chatId,
        `⚠️ <a href="tg://user?id=${userId}">${name}</a>, টেক্সট পাঠানোর জন্য আপনাকে প্রথমে আরও <b>${remaining} জনকে</b> গ্রুপে অ্যাড করতে হবে!\n` +
          `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
        CONFIG.WARNING_AUTO_DELETE_MS
      );
      return;
    }

    // ── ২. ফ্লাড ডিটেকশন ────────────────────────────────────────────
    if (isFlooding(chatId, userId)) {
      await deleteMessageSafe(bot, chatId, messageId);
      const name = getDisplayName(msg.from);
      const unmuteDate = await muteUser(bot, chatId, userId, 1);
      await sendAutoDelete(
        bot,
        chatId,
        `🌊 <b>অ্যান্টি-ফ্লাড সিস্টেম</b>\n` +
          `<a href="tg://user?id=${userId}">${name}</a> অতিরিক্ত মেসেজ পাঠানোর কারণে মিউট করা হয়েছে।\n` +
          `মিউট শেষ হবে: ${formatDate(unmuteDate)} রাত/দিন ${formatTime(unmuteDate)}-এ।`,
        15000
      );
      return;
    }

    // ── ৩. লিংক / ইউজারনেম স্প্যাম প্রতিরোধ ───────────────────────
    LINK_REGEX.lastIndex = 0;
    if (LINK_REGEX.test(text)) {
      await deleteMessageSafe(bot, chatId, messageId);
      const name = getDisplayName(msg.from);
      const warnings = addWarning(userId);

      if (warnings.warnings >= CONFIG.MAX_WARNINGS) {
        const unmuteDate = await muteUser(bot, chatId, userId);
        updateUser(userId, { warnings: 0 });
        try {
          await bot.sendMessage(
            chatId,
            `🪐 <b>গ্রুপ গার্ড</b> 🚫\n` +
              `<a href="tg://user?id=${userId}">${name}</a> [<code>${userId}</code>] স্প্যাম/নিষিদ্ধ মেসেজ পাঠিয়েছেন।\n` +
              `অ্যাকশন: মিউট 🔇 করা হয়েছে ${formatDate(unmuteDate)} তারিখ ${formatTime(unmuteDate)} পর্যন্ত।\n\n` +
              `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
            { parse_mode: "HTML" }
          );
        } catch (err) {
          logger.warn({ err }, "Could not send mute notification");
        }
      } else {
        const remaining = CONFIG.MAX_WARNINGS - warnings.warnings;
        await sendAutoDelete(
          bot,
          chatId,
          `🪐 <b>গ্রুপ গার্ড</b> ⚠️\n` +
            `<a href="tg://user?id=${userId}">${name}</a> নিষিদ্ধ লিংক/ইউজারনেম পাঠিয়েছেন।\n` +
            `সতর্কতা <b>${warnings.warnings}/${CONFIG.MAX_WARNINGS}</b> — আরও <b>${remaining}টি</b> সতর্কতার পর মিউট করা হবে।\n\n` +
            `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
          CONFIG.WARNING_AUTO_DELETE_MS
        );
      }
      return;
    }

    // ── ৪. চ্যানেল ফরোয়ার্ড ব্লক ────────────────────────────────────
    if (msg.forward_from_chat) {
      await deleteMessageSafe(bot, chatId, messageId);
      await sendAutoDelete(
        bot,
        chatId,
        `⛔ চ্যানেল থেকে ফরোয়ার্ড করা মেসেজ এই গ্রুপে অনুমোদিত নয়।\n` +
          `<a href="tg://user?id=${userId}">${getDisplayName(msg.from)}</a>, শুধুমাত্র নিজের কন্টেন্ট পোস্ট করুন।`,
        CONFIG.WARNING_AUTO_DELETE_MS
      );
    }
  });
}
