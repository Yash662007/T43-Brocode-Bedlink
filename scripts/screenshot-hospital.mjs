import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const artifactDir = "C:\\Users\\aman0\\.gemini\\antigravity\\brain\\a8cb50a9-2810-4901-a750-fa2a296ef5d4";

const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function run() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  const configs = [
    { width: 360, height: 640, theme: "light", file: "hospital_360x640_light.png" },
    { width: 360, height: 640, theme: "dark", file: "hospital_360x640_dark.png" },
    { width: 390, height: 844, theme: "light", file: "hospital_390x844_light.png" },
    { width: 390, height: 844, theme: "dark", file: "hospital_390x844_dark.png" },
  ];

  for (const cfg of configs) {
    await page.setViewport({ width: cfg.width, height: cfg.height, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:8080/?screen=hospital&theme=${cfg.theme}`, {
      waitUntil: "networkidle0",
    });

    if (cfg.theme === "dark") {
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      });
    } else {
      await page.evaluate(() => {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      });
    }

    await new Promise((r) => setTimeout(r, 600));

    const outPath = path.join(artifactDir, cfg.file);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved screenshot: ${outPath}`);
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
