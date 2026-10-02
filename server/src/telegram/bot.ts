import { Bot, InlineKeyboard } from "grammy";
import { db } from "../db/index.js";
import { resolveToken } from "../lib/tokens.js";
import { getHospital } from "../lib/hospitals.js";
import { listBedSnapshots, applyBedUpdate } from "../lib/beds.js";
import { capabilitiesConfig } from "../config/index.js";
import { getHospitalCapabilities, setSpecialistOnCall, hasCapability } from "../lib/capabilities.js";
import { nowIso } from "../lib/ids.js";
import { parseBedCountsText, type ParsedBedCount } from "./parse.js";

type TelegramLink = { chat_id: string; hospital_id: string; token: string; linked_at: string };

function getLink(chatId: string): TelegramLink | undefined {
  return db.prepare(`SELECT * FROM telegram_links WHERE chat_id = ?`).get(chatId) as
    | TelegramLink
    | undefined;
}

function upsertLink(chatId: string, hospitalId: string, token: string) {
  db.prepare(
    `INSERT INTO telegram_links (chat_id, hospital_id, token, linked_at)
     VALUES (@chatId, @hospitalId, @token, @linkedAt)
     ON CONFLICT (chat_id) DO UPDATE SET hospital_id = @hospitalId, token = @token, linked_at = @linkedAt`,
  ).run({ chatId, hospitalId, token, linkedAt: nowIso() });
}

const bedLabels: Record<string, string> = {
  icu: "ICU",
  ventilator: "Ventilator",
  oxygen: "Oxygen",
  cardiac: "Cardiac",
  burns: "Burns",
};

// Pending free-text parses awaiting the nurse's Confirm/Edit tap, keyed by chat id.
const pendingByChat = new Map<string, { parsed: ParsedBedCount[]; hospitalId: string }>();

function formatParsed(parsed: ParsedBedCount[]): string {
  return parsed.map((p) => `${bedLabels[p.bedType]}: ${p.value} free`).join("\n");
}

export function startBot() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required to start the bot.");

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.toString().trim();
    if (!payload) {
      await ctx.reply(
        "Welcome to BedLink. Ask your hospital admin for your contact token, then send:\n/start <token>",
      );
      return;
    }
    const resolved = resolveToken(payload);
    if (!resolved) {
      await ctx.reply("That token wasn't recognized. Please check it and try again.");
      return;
    }
    const hospital = getHospital(resolved.hospital_id);
    upsertLink(String(ctx.chat.id), resolved.hospital_id, resolved.token);
    await ctx.reply(
      `Linked to ${hospital?.name ?? resolved.hospital_id}. Send bed counts any time, e.g. "ICU 2, vent 1". Use /shiftchange at handover and /specialist to toggle on-call specialists.`,
    );
  });

  bot.command("shiftchange", async (ctx) => {
    const link = getLink(String(ctx.chat.id));
    if (!link) {
      await ctx.reply("Not linked yet. Send /start <token> first.");
      return;
    }
    const snapshots = listBedSnapshots(link.hospital_id);
    const summary = snapshots
      .map((s) => `${bedLabels[s.bedType]}: ${s.unknown ? "unknown" : `${s.freeReported} free`}`)
      .join("\n");

    const keyboard = new InlineKeyboard().text("Same", "shift_same").text("Change", "shift_change");
    await ctx.reply(`Shift change — last known counts:\n${summary}\n\nStill correct?`, {
      reply_markup: keyboard,
    });
  });

  bot.command("specialist", async (ctx) => {
    const link = getLink(String(ctx.chat.id));
    if (!link) {
      await ctx.reply("Not linked yet. Send /start <token> first.");
      return;
    }
    const owned = getHospitalCapabilities(link.hospital_id).filter(
      (cap) => capabilitiesConfig.capabilities[cap]?.needsSpecialist,
    );
    if (owned.length === 0) {
      await ctx.reply("No specialist-dependent capabilities are configured for your hospital.");
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const cap of owned) {
      const on = hasCapability(link.hospital_id, cap);
      const label = capabilitiesConfig.capabilities[cap]?.label ?? cap;
      keyboard.text(`${label}: ${on ? "ON ✅" : "OFF"}`, `spec:${cap}`).row();
    }
    await ctx.reply("Tap to toggle on-call specialist status:", { reply_markup: keyboard });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = String(ctx.chat?.id ?? "");
    const link = getLink(chatId);

    if (data === "confirm" || data === "edit") {
      const pending = pendingByChat.get(chatId);
      if (!pending) {
        await ctx.answerCallbackQuery({ text: "That update already expired." });
        return;
      }
      if (data === "edit") {
        pendingByChat.delete(chatId);
        await ctx.answerCallbackQuery();
        await ctx.reply("OK, send the corrected counts as a new message.");
        return;
      }
      for (const update of pending.parsed) {
        applyBedUpdate({
          hospitalId: pending.hospitalId,
          bedType: update.bedType,
          value: update.value,
          source: "telegram",
          actor: ctx.from?.username ?? ctx.from?.first_name,
          eventType: "telegram",
        });
      }
      pendingByChat.delete(chatId);
      await ctx.answerCallbackQuery({ text: "Saved." });
      await ctx.reply(`Updated:\n${formatParsed(pending.parsed)}`);
      return;
    }

    if (data === "shift_same" || data === "shift_change") {
      if (!link) {
        await ctx.answerCallbackQuery();
        return;
      }
      if (data === "shift_change") {
        await ctx.answerCallbackQuery();
        await ctx.reply("Send the updated counts as a message, e.g. \"ICU 2, vent 1\".");
        return;
      }
      for (const snapshot of listBedSnapshots(link.hospital_id)) {
        if (snapshot.unknown) continue;
        applyBedUpdate({
          hospitalId: link.hospital_id,
          bedType: snapshot.bedType,
          stillCorrect: true,
          source: "telegram",
          actor: ctx.from?.username ?? ctx.from?.first_name,
          eventType: "nurse_confirmed",
        });
      }
      await ctx.answerCallbackQuery({ text: "Confirmed, thanks." });
      return;
    }

    if (data.startsWith("spec:") && link) {
      const capability = data.slice("spec:".length);
      const currentlyOn = hasCapability(link.hospital_id, capability);
      setSpecialistOnCall({
        hospitalId: link.hospital_id,
        capability,
        isOn: !currentlyOn,
        source: "telegram",
      });
      await ctx.answerCallbackQuery({ text: !currentlyOn ? "Marked on-call." : "Marked off-call." });
      return;
    }

    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const chatId = String(ctx.chat.id);
    const link = getLink(chatId);
    if (!link) {
      await ctx.reply("Not linked yet. Send /start <token> first.");
      return;
    }

    const parsed = parseBedCountsText(text);
    if (parsed.length === 0) {
      await ctx.reply(
        'Could not find a bed type and count in that message. Try something like "ICU 2, vent 1".',
      );
      return;
    }

    pendingByChat.set(chatId, { parsed, hospitalId: link.hospital_id });
    const keyboard = new InlineKeyboard().text("Confirm", "confirm").text("Edit", "edit");
    await ctx.reply(`Did you mean:\n${formatParsed(parsed)}`, { reply_markup: keyboard });
  });

  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  bot.start();
  console.log("Telegram bot started (long polling).");
  return bot;
}
