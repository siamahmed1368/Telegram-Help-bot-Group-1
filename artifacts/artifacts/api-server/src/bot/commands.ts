import TelegramBot from "node-telegram-bot-api";
import { CONFIG, FULLY_RESTRICTED } from "./config";
import {
  getUser,
  updateUser,
  addInvites,
  resetWarnings,
  setBanned,
  getAllUsers,
} from "./store";
import {
  getDisplayName,
  formatDate,
  formatTime,
  deleteMessageSafe,
  getGroupAdmins,
  invalidateAdminCache,
  parseUserArg,
} from "./utils";
import { resetFlood } from "./flood";
import { logger } from "../lib/logger";

export function registerCommands(bot: TelegramBot): void {
  // /myinvites — নিজের ইনভাইট কাউন্ট দেখো
  bot.onText(/^\/myinvites$/i, async (msg) => {
    if (!msg.from || msg.chat.type === "private") return;
    const user = getUser(msg.from.id);
    const name = getDisplayName(msg.from);
    const remaining = Math.max(0, CONFIG.REQUIRED_INVITES - user.invites);
    const text =
      `📊 <b>${name}-এর ইনভাইট তথ্য</b>\n\n` +
      `✅ মোট ইনভাইট: <b>${user.invites}</b>\n` +
      `⚠️ সতর্কতা: <b>${user.warnings}/${CONFIG.MAX_WARNINGS}</b>\n` +
      (remaining > 0
        ? `🔒 চ্যাট আনলক করতে আরও <b>${remaining} জনকে</b> অ্যাড করুন।`
        : `🟢 চ্যাট অ্যাক্সেস: <b>আনলক হয়েছে</b>`);
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const reply = await bot.sendMessage(msg.chat.id, text, {
      parse_mode: "HTML",
    });
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      15000
    );
  });

  // /invites [user_id] — অ্যাডমিন: যেকোনো ইউজারের তথ্য
  bot.onText(/^\/invites(?:\s+(\d+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = match?.[1] ? parseInt(match[1], 10) : msg.from.id;
    const user = getUser(targetId);
    const text =
      `📋 <b>ইউজার তথ্য</b> [${targetId}]\n\n` +
      `✅ মোট ইনভাইট: <b>${user.invites}</b>\n` +
      `⚠️ সতর্কতা: <b>${user.warnings}/${CONFIG.MAX_WARNINGS}</b>\n` +
      `🚫 ব্যান: <b>${user.banned ? "হ্যাঁ" : "না"}</b>\n` +
      (user.mutedUntil && user.mutedUntil > Date.now()
        ? `🔇 মিউট শেষ: <b>${formatDate(new Date(user.mutedUntil))} ${formatTime(new Date(user.mutedUntil))}</b>`
        : `🔊 মিউট অবস্থা: <b>সক্রিয় নয়</b>`);
    const reply = await bot.sendMessage(msg.chat.id, text, {
      parse_mode: "HTML",
    });
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      20000
    );
  });

  // /addcredit [user_id] [amount] — অ্যাডমিন: ইনভাইট ক্রেডিট যোগ করো
  bot.onText(/^\/addcredit\s+(\d+)(?:\s+(\d+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    const amount = match?.[2] ? parseInt(match[2], 10) : 1;
    const updated = addInvites(targetId, amount);
    const reply = await bot.sendMessage(
      msg.chat.id,
      `✅ ইউজার <code>${targetId}</code>-কে <b>${amount}টি</b> ইনভাইট ক্রেডিট দেওয়া হয়েছে।\nমোট ইনভাইট: <b>${updated.invites}</b>`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      10000
    );
  });

  // /warn [user_id] [reason] — অ্যাডমিন: সতর্ক করো
  bot.onText(/^\/warn\s+(\d+)(?:\s+(.+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    const reason = match?.[2] ?? "কোনো কারণ উল্লেখ করা হয়নি";
    const user = getUser(targetId);
    const newWarnings = user.warnings + 1;
    updateUser(targetId, { warnings: newWarnings });

    if (newWarnings >= CONFIG.MAX_WARNINGS) {
      const unmuteDate = new Date(
        Date.now() + CONFIG.MUTE_DURATION_HOURS * 3600000
      );
      try {
        await bot.restrictChatMember(msg.chat.id, targetId, {
          permissions: FULLY_RESTRICTED,
          until_date: Math.floor(unmuteDate.getTime() / 1000),
        });
        updateUser(targetId, {
          mutedUntil: unmuteDate.getTime(),
          warnings: 0,
        });
      } catch (err) {
        logger.warn({ err }, "Could not mute on max warnings");
      }
      const reply = await bot.sendMessage(
        msg.chat.id,
        `🪐 <b>গ্রুপ গার্ড</b> 🚫\n` +
          `ইউজার <code>${targetId}</code> সর্বোচ্চ সতর্কতায় পৌঁছেছেন।\n` +
          `অ্যাকশন: মিউট 🔇 করা হয়েছে ${formatDate(unmuteDate)} তারিখ ${formatTime(unmuteDate)} পর্যন্ত।\n\n` +
          `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
        { parse_mode: "HTML" }
      );
      setTimeout(
        () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
        15000
      );
    } else {
      const reply = await bot.sendMessage(
        msg.chat.id,
        `⚠️ ইউজার <code>${targetId}</code>-কে সতর্ক করা হয়েছে\n` +
          `কারণ: ${reason}\n` +
          `সতর্কতা: <b>${newWarnings}/${CONFIG.MAX_WARNINGS}</b>`,
        { parse_mode: "HTML" }
      );
      setTimeout(
        () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
        12000
      );
    }
  });

  // /resetwarn [user_id] — অ্যাডমিন: সতর্কতা রিসেট করো
  bot.onText(/^\/resetwarn\s+(\d+)$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    resetWarnings(targetId);
    resetFlood(msg.chat.id, targetId);
    const reply = await bot.sendMessage(
      msg.chat.id,
      `✅ ইউজার <code>${targetId}</code>-এর সব সতর্কতা মুছে দেওয়া হয়েছে।`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      8000
    );
  });

  // /mute [user_id] [hours?] — অ্যাডমিন: মিউট করো
  bot.onText(/^\/mute\s+(\d+)(?:\s+(\d+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    const hours = match?.[2] ? parseInt(match[2], 10) : CONFIG.MUTE_DURATION_HOURS;
    const unmuteDate = new Date(Date.now() + hours * 3600000);
    try {
      await bot.restrictChatMember(msg.chat.id, targetId, {
        permissions: FULLY_RESTRICTED,
        until_date: Math.floor(unmuteDate.getTime() / 1000),
      });
      updateUser(targetId, { mutedUntil: unmuteDate.getTime() });
    } catch (err) {
      logger.warn({ err }, "Could not mute user");
    }
    const reply = await bot.sendMessage(
      msg.chat.id,
      `🔇 ইউজার <code>${targetId}</code>-কে মিউট করা হয়েছে ${formatDate(unmuteDate)} তারিখ ${formatTime(unmuteDate)} পর্যন্ত।`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      12000
    );
  });

  // /unmute [user_id] — অ্যাডমিন: মিউট তুলে নাও
  bot.onText(/^\/unmute\s+(\d+)$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    try {
      await bot.restrictChatMember(msg.chat.id, targetId, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });
      updateUser(targetId, { mutedUntil: undefined });
    } catch (err) {
      logger.warn({ err }, "Could not unmute user");
    }
    const reply = await bot.sendMessage(
      msg.chat.id,
      `🔊 ইউজার <code>${targetId}</code>-এর মিউট তুলে নেওয়া হয়েছে।`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      8000
    );
  });

  // /ban [user_id] [reason?] — অ্যাডমিন: ব্যান করো
  bot.onText(/^\/ban\s+(\d+)(?:\s+(.+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    const reason = match?.[2] ?? "গ্রুপের নিয়ম ভঙ্গ করেছেন";
    try {
      await bot.banChatMember(msg.chat.id, targetId);
      setBanned(targetId, true);
    } catch (err) {
      logger.warn({ err }, "Could not ban user");
    }
    const reply = await bot.sendMessage(
      msg.chat.id,
      `🚫 <b>ইউজার ব্যান হয়েছেন</b>\n` +
        `ইউজার <code>${targetId}</code>-কে স্থায়ীভাবে ব্যান করা হয়েছে।\n` +
        `কারণ: ${reason}\n\n` +
        `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      15000
    );
  });

  // /unban [user_id] — অ্যাডমিন: ব্যান তুলে নাও
  bot.onText(/^\/unban\s+(\d+)$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    try {
      await bot.unbanChatMember(msg.chat.id, targetId, {
        only_if_banned: true,
      });
      setBanned(targetId, false);
    } catch (err) {
      logger.warn({ err }, "Could not unban user");
    }
    const reply = await bot.sendMessage(
      msg.chat.id,
      `✅ ইউজার <code>${targetId}</code>-এর ব্যান তুলে নেওয়া হয়েছে।`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      8000
    );
  });

  // /stats — অ্যাডমিন: গ্রুপ পরিসংখ্যান
  bot.onText(/^\/stats$/i, async (msg) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const all = getAllUsers();
    const entries = Object.entries(all);
    const unlocked = entries.filter(
      ([, u]) => u.invites >= CONFIG.REQUIRED_INVITES
    ).length;
    const banned = entries.filter(([, u]) => u.banned).length;
    const muted = entries.filter(
      ([, u]) => u.mutedUntil && u.mutedUntil > Date.now()
    ).length;
    const warned = entries.filter(([, u]) => u.warnings > 0).length;
    const reply = await bot.sendMessage(
      msg.chat.id,
      `📊 <b>গ্রুপ পরিসংখ্যান</b>\n\n` +
        `👥 মোট ট্র্যাক করা সদস্য: <b>${entries.length}</b>\n` +
        `🟢 চ্যাট আনলক হয়েছে: <b>${unlocked}</b>\n` +
        `🔇 বর্তমানে মিউট: <b>${muted}</b>\n` +
        `⚠️ সতর্কতা আছে: <b>${warned}</b>\n` +
        `🚫 ব্যান করা সদস্য: <b>${banned}</b>`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      20000
    );
  });

  // /leaderboard — শীর্ষ ইনভাইটার (সবাই দেখতে পারবে)
  bot.onText(/^\/leaderboard$/i, async (msg) => {
    if (!msg.from || msg.chat.type === "private") return;
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);

    const all = getAllUsers();
    const medals = ["🥇", "🥈", "🥉"];
    const ranked = Object.entries(all)
      .filter(([, u]) => u.invites > 0 && !u.banned)
      .sort(([, a], [, b]) => b.invites - a.invites)
      .slice(0, 10);

    if (ranked.length === 0) {
      const reply = await bot.sendMessage(
        msg.chat.id,
        `🏆 <b>ইনভাইট লিডারবোর্ড</b>\n\nএখনো কোনো ইনভাইট রেকর্ড নেই। প্রথম হওয়ার সুযোগ আপনারই!`,
        { parse_mode: "HTML" }
      );
      setTimeout(
        () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
        15000
      );
      return;
    }

    const rows = ranked.map(([id, u], i) => {
      const medal = medals[i] ?? `<b>${i + 1}.</b>`;
      const name = u.firstName
        ? `<a href="tg://user?id=${id}">${u.firstName}</a>`
        : `<code>${id}</code>`;
      const lock = u.invites >= CONFIG.REQUIRED_INVITES ? "🟢" : "🔒";
      return `${medal} ${name} — <b>${u.invites}</b> জন ${lock}`;
    });

    const reply = await bot.sendMessage(
      msg.chat.id,
      `🏆 <b>শীর্ষ ইনভাইটার — ${CONFIG.GROUP_NAME}</b>\n\n` +
        rows.join("\n") +
        `\n\n💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      30000
    );
  });

  // /kick [user_id] [reason?] — অ্যাডমিন: কিক করো (পুনরায় জয়েন করতে পারবে)
  bot.onText(/^\/kick\s+(\d+)(?:\s+(.+))?$/i, async (msg, match) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const targetId = parseInt(match![1], 10);
    const reason = match?.[2] ?? "গ্রুপের নিয়ম ভঙ্গ করেছেন";

    try {
      await bot.banChatMember(msg.chat.id, targetId);
      await bot.unbanChatMember(msg.chat.id, targetId, { only_if_banned: true });
    } catch (err) {
      logger.warn({ err }, "Could not kick user");
      const reply = await bot.sendMessage(
        msg.chat.id,
        `❌ ইউজার <code>${targetId}</code>-কে কিক করা সম্ভব হয়নি। বটের পারমিশন চেক করুন।`,
        { parse_mode: "HTML" }
      );
      setTimeout(
        () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
        8000
      );
      return;
    }

    const reply = await bot.sendMessage(
      msg.chat.id,
      `👢 <b>ইউজার কিক হয়েছেন</b>\n` +
        `ইউজার <code>${targetId}</code>-কে গ্রুপ থেকে বের করে দেওয়া হয়েছে।\n` +
        `কারণ: ${reason}\n` +
        `<i>তারা ইনভাইট লিংক দিয়ে পুনরায় যোগ দিতে পারবেন।</i>\n\n` +
        `💬 পেইড গ্রুপ কিনলে মেসেজ দিন: ${CONFIG.PROMO_USERNAME}`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      15000
    );
  });

  // /help — অ্যাডমিন: কমান্ড লিস্ট দেখো
  bot.onText(/^\/help$/i, async (msg) => {
    if (!msg.from || msg.chat.type === "private") return;
    const admins = await getGroupAdmins(bot, msg.chat.id);
    if (!admins.has(msg.from.id)) {
      await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
      return;
    }
    await deleteMessageSafe(bot, msg.chat.id, msg.message_id);
    const reply = await bot.sendMessage(
      msg.chat.id,
      `🤖 <b>গ্রুপ গার্ড — অ্যাডমিন কমান্ড</b>\n\n` +
        `<b>📋 তথ্য দেখুন</b>\n` +
        `/myinvites — নিজের ইনভাইট কাউন্ট দেখুন\n` +
        `/invites [id] — যেকোনো ইউজারের তথ্য দেখুন\n` +
        `/leaderboard — শীর্ষ ১০ ইনভাইটার (সবাই দেখতে পারবে)\n` +
        `/stats — গ্রুপের সামগ্রিক পরিসংখ্যান\n\n` +
        `<b>🛡️ মডারেশন</b>\n` +
        `/warn [id] [কারণ] — সতর্ক করুন\n` +
        `/resetwarn [id] — সতর্কতা মুছে দিন\n` +
        `/mute [id] [ঘণ্টা?] — মিউট করুন\n` +
        `/unmute [id] — মিউট তুলুন\n` +
        `/kick [id] [কারণ?] — কিক করুন (পুনরায় যোগ দিতে পারবে)\n` +
        `/ban [id] [কারণ?] — স্থায়ী ব্যান\n` +
        `/unban [id] — ব্যান তুলুন\n\n` +
        `<b>💳 ক্রেডিট</b>\n` +
        `/addcredit [id] [পরিমাণ?] — ইনভাইট ক্রেডিট যোগ করুন`,
      { parse_mode: "HTML" }
    );
    setTimeout(
      () => deleteMessageSafe(bot, msg.chat.id, reply.message_id),
      30000
    );
  });

  // অ্যাডমিন ক্যাশ রিফ্রেশ
  bot.on("my_chat_member", (msg) => {
    invalidateAdminCache(msg.chat.id);
  });
}
