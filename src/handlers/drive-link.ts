import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";

const DRIVE_URL_RE =
  /https?:\/\/drive\.google\.com\/(?:file\/d\/([-\w]{20,})\/view|open\?id=([-\w]{20,})|uc\?id=([-\w]{20,})(?:&export=download)?)/i;

function extractFileId(url: string): string | null {
  const m = DRIVE_URL_RE.exec(url);
  if (!m) return null;
  return m[1] || m[2] || m[3] || null;
}

const DEFAULT_RATE_LIMIT = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024;
const TELEGRAM_MAX_SIZE = 2 * 1024 * 1024 * 1024;

function getApiKey(): string | undefined {
  return process.env.GOOGLE_DRIVE_API_KEY;
}

async function fetchDriveMetadata(
  fileId: string,
  apiKey: string,
): Promise<{
  name: string;
  size: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
} | null> {
  const fields = encodeURIComponent(
    "name,size,mimeType,thumbnailLink,webViewLink",
  );
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=${fields}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      name: String(data.name ?? "unknown"),
      size: String(data.size ?? "0"),
      mimeType: String(data.mimeType ?? "application/octet-stream"),
      thumbnailLink: data.thumbnailLink
        ? String(data.thumbnailLink)
        : undefined,
      webViewLink: data.webViewLink ? String(data.webViewLink) : undefined,
    };
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

registerMainMenuItem({
  label: "🔗 Submit link",
  data: "drive:prompt",
  order: 10,
});

const composer = new Composer<Ctx>();

composer.callbackQuery("drive:prompt", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_drive_link";
  await ctx.editMessageText(
    "Paste a public Google Drive video link and I'll handle the rest.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  const fileId = extractFileId(text);

  if (!fileId && ctx.session.step !== "awaiting_drive_link") {
    return next();
  }

  if (!fileId) {
    ctx.session.step = undefined;
    await ctx.reply(
      "That doesn't look like a Google Drive link. Share a link like:\nhttps://drive.google.com/file/d/…/view",
    );
    return;
  }

  const now = Date.now();
  const rateLimit =
    ctx.session.adminSettings?.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT;
  const windowStart = now - 60_000;
  if (
    (ctx.session.lastRequestTime ?? 0) < windowStart &&
    (ctx.session.rateRequests ?? 0) > 0
  ) {
    ctx.session.rateRequests = 0;
  }
  if ((ctx.session.rateRequests ?? 0) >= rateLimit) {
    await ctx.reply(
      "You're sending links too fast. Please wait a moment and try again.",
    );
    return;
  }
  ctx.session.rateRequests = (ctx.session.rateRequests ?? 0) + 1;
  ctx.session.lastRequestTime = now;

  const apiKey = getApiKey();
  if (!apiKey) {
    await ctx.reply(
      "Google Drive integration isn't configured yet. The bot admin needs to set up an API key.",
    );
    return;
  }

  await ctx.replyWithChatAction("typing");
  const meta = await fetchDriveMetadata(fileId, apiKey);

  if (!meta) {
    await ctx.reply(
      "Couldn't access that file. Make sure the link is public (Anyone with the link) and try again.",
    );
    return;
  }

  const sizeBytes = parseInt(meta.size, 10);

  if (sizeBytes > MAX_FILE_SIZE) {
    await ctx.reply(
      `That file is ${formatSize(sizeBytes)}, which is over the 100 GB limit. Try a smaller file.`,
    );
    return;
  }

  ctx.session.fileMeta = {
    fileId,
    fileName: meta.name,
    sizeBytes,
    mimeType: meta.mimeType,
    thumbnailUrl: meta.thumbnailLink,
    webViewLink: meta.webViewLink,
  };
  ctx.session.step = "drive_action";

  const isVideo = meta.mimeType.startsWith("video/");
  const sizeLabel = formatSize(sizeBytes);

  let info = `**${meta.name}**\n`;
  info += `Size: ${sizeLabel}\n`;
  info += `Type: ${meta.mimeType}\n`;

  if (!isVideo) {
    info += "\nThis file doesn't appear to be a video, but I can still try to process it.";
  }

  if (sizeBytes > TELEGRAM_MAX_SIZE) {
    info += `\nThis file is too large to send via Telegram (${sizeLabel} > 2 GB). Use Download or Stream instead.`;
  }

  const idSlice = fileId.slice(0, 20);
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  buttons.push([
    inlineButton("⬇️ Download", `drive:action:download:${idSlice}`),
    inlineButton("▶️ Stream", `drive:action:stream:${idSlice}`),
  ]);

  if (sizeBytes <= TELEGRAM_MAX_SIZE) {
    buttons.push([
      inlineButton("📤 Send via Telegram", `drive:action:send:${idSlice}`),
    ]);
  }

  buttons.push([inlineButton("❌ Cancel", "drive:action:cancel")]);

  await ctx.reply(info, {
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard(buttons),
  });
});

composer.callbackQuery(/^drive:action:(download|stream|send|cancel):?(.+)?$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const action = ctx.match[1];

  if (action === "cancel") {
    ctx.session.step = undefined;
    ctx.session.fileMeta = undefined;
    await ctx.editMessageText("Cancelled. Send another link or tap /start.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const fileMeta = ctx.session.fileMeta;
  if (!fileMeta) {
    await ctx.editMessageText("No file selected. Send a Drive link to start.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const fileId = fileMeta.fileId;

  if (action === "download") {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    await ctx.editMessageText(
      `Download ready for **${fileMeta.fileName}**\n\nTap the button below to open the download link in your browser.`,
      {
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard([
          [inlineButton("⬇️ Open download link", downloadUrl)],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  } else if (action === "stream") {
    const streamUrl = fileMeta.webViewLink
      ? fileMeta.webViewLink
      : `https://drive.google.com/file/d/${fileId}/preview`;
    await ctx.editMessageText(
      `Stream ready for **${fileMeta.fileName}**\n\nTap the button below to open the streaming preview.`,
      {
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard([
          [inlineButton("▶️ Open stream", streamUrl)],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  } else if (action === "send") {
    if (fileMeta.sizeBytes > TELEGRAM_MAX_SIZE) {
      await ctx.editMessageText(
        "This file is too large to send via Telegram (over 2 GB). Use Download or Stream instead.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
      return;
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    await ctx.editMessageText(
      `Here's the direct link for **${fileMeta.fileName}**. Telegram can't upload Google Drive files directly, but you can download it from this link and send it manually.`,
      {
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard([
          [inlineButton("⬇️ Download file", downloadUrl)],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  }
});

export default composer;
