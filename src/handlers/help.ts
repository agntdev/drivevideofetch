import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "ℹ️ Tap /start to open the menu, then pick what you want from the buttons.\n\n" +
  "Everything in this bot is reachable by tapping — you don't need to remember any commands.";

const HOW_IT_WORKS =
  "🔗 How it works:\n\n" +
  "1. Tap \"Submit link\" on the main menu\n" +
  "2. Paste a public Google Drive video link\n" +
  "3. I'll validate the link and show file info\n" +
  "4. Choose to download, stream, or send via Telegram\n\n" +
  'Your link must be set to "Anyone with the link" in Google Drive sharing settings.';

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
const helpMenu = inlineKeyboard([
  [inlineButton("📖 How it works", "menu:how-it-works")],
  [inlineButton("⬅️ Back to menu", "menu:main")],
]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP, { reply_markup: helpMenu });
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: helpMenu });
});

composer.callbackQuery("menu:how-it-works", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HOW_IT_WORKS, { reply_markup: backToMenu });
});

export default composer;
