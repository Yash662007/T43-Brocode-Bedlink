import "dotenv/config";
import { runMigrations } from "./db/index.js";
import { createApp } from "./app.js";
import { startTicker } from "./lib/ticker.js";

runMigrations();
const app = createApp();
const port = Number(process.env["PORT"] ?? 4000);

app.listen(port, () => {
  console.log(`BedLink server listening on http://localhost:${port}`);
});

startTicker();

if (process.env["TELEGRAM_BOT_TOKEN"]) {
  import("./telegram/bot.js").then((mod) => mod.startBot()).catch((err) => {
    console.error("Telegram bot failed to start:", err);
  });
} else {
  console.log("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.");
}
