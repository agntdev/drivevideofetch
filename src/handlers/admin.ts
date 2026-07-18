import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";

/** Only the bot owner (first user to interact) can access admin controls. */
function isOwner(ctx: Ctx): boolean {
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) return true;
  return String(ctx.from?.id) === ownerId;
}

registerMainMenuItem({
  label: "⚙️ Settings",
  data: "admin:menu",
  order: 50,
});

const composer = new Composer<Ctx>();

composer.callbackQuery("admin:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) {
    await ctx.editMessageText("Only the bot owner can access settings.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const s = ctx.session.adminSettings ?? {};
  const notifStatus = s.adminNotificationsEnabled !== false ? "ON" : "OFF";
  const rateLimit = s.rateLimitPerMinute ?? 10;
  const urlTtl = s.urlTtlHours ?? 24;
  const adminChat = s.adminChatId ?? "not set";

  const text =
    "⚙️ Admin settings\n\n" +
    `Notifications: ${notifStatus}\n` +
    `Admin chat: ${adminChat}\n` +
    `Rate limit: ${rateLimit} req/min\n` +
    `URL TTL: ${urlTtl}h`;

  const buttons = [
    [
      inlineButton(
        `🔔 Notifications: ${notifStatus}`,
        "admin:toggle:notifications",
      ),
    ],
    [inlineButton("💬 Set admin chat", "admin:set:chat")],
    [inlineButton("🔢 Set rate limit", "admin:set:ratelimit")],
    [inlineButton("⏰ Set URL TTL", "admin:set:ttl")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ];

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery("admin:toggle:notifications", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;

  const s = ctx.session.adminSettings ?? {};
  s.adminNotificationsEnabled = s.adminNotificationsEnabled === false;
  ctx.session.adminSettings = s;

  const status = s.adminNotificationsEnabled ? "ON" : "OFF";
  await ctx.editMessageText(`Admin notifications turned ${status}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to settings", "admin:menu")],
    ]),
  });
});

composer.callbackQuery("admin:set:ratelimit", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;

  const options = [
    inlineButton("5 req/min", "admin:ratelimit:5"),
    inlineButton("10 req/min", "admin:ratelimit:10"),
    inlineButton("20 req/min", "admin:ratelimit:20"),
    inlineButton("50 req/min", "admin:ratelimit:50"),
  ];

  await ctx.editMessageText("Choose a rate limit:", {
    reply_markup: inlineKeyboard([
      options.slice(0, 2),
      options.slice(2, 4),
      [inlineButton("⬅️ Back", "admin:menu")],
    ]),
  });
});

composer.callbackQuery(/^admin:ratelimit:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;

  const limit = parseInt(ctx.match[1], 10);
  const s = ctx.session.adminSettings ?? {};
  s.rateLimitPerMinute = limit;
  ctx.session.adminSettings = s;

  await ctx.editMessageText(`Rate limit set to ${limit} req/min.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to settings", "admin:menu")],
    ]),
  });
});

composer.callbackQuery("admin:set:ttl", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;

  const options = [
    inlineButton("1 hour", "admin:ttl:1"),
    inlineButton("6 hours", "admin:ttl:6"),
    inlineButton("24 hours", "admin:ttl:24"),
    inlineButton("72 hours", "admin:ttl:72"),
  ];

  await ctx.editMessageText("Choose URL expiration time:", {
    reply_markup: inlineKeyboard([
      options.slice(0, 2),
      options.slice(2, 4),
      [inlineButton("⬅️ Back", "admin:menu")],
    ]),
  });
});

composer.callbackQuery(/^admin:ttl:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;

  const hours = parseInt(ctx.match[1], 10);
  const s = ctx.session.adminSettings ?? {};
  s.urlTtlHours = hours;
  ctx.session.adminSettings = s;

  await ctx.editMessageText(`URL TTL set to ${hours} hours.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to settings", "admin:menu")],
    ]),
  });
});

export default composer;
