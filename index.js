const puppeteer = require("puppeteer");
const axios = require("axios");

// ✅ MULTIPLE SEARCHES
const URLS = [
  "https://www.ajio.com/search/?text=gold%20coin",
  "https://www.ajio.com/search/?text=24k%20gold%20coin",
  "https://www.ajio.com/search/?text=999%20gold%20coin",
  "https://www.ajio.com/search/?text=gold%2024k%202gm",
  "https://www.ajio.com/search/?text=gold%2024k%200.5gm",
  "https://www.ajio.com/search/?text=gold%2024k%201gm",
  "https://www.ajio.com/search/?text=gold%200.5gm"
];

const TARGET_PRICE = 330000;

const WEIGHTS = ["0.5 gm", "1 gm", "2 gm"];

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS.split(",");

// ✅ Weight detection (same fix)
function getWeight(title) {
  const t = title.toLowerCase();

  if (t.includes("0.5")) return "0.5 gm";

  if (t.includes("1 gm") || t.includes("1g") || t.includes("1 gram"))
    return "1 gm";

  if (t.includes("2 gm") || t.includes("2g") || t.includes("2 gram"))
    return "2 gm";

  return null;
}

// ✅ Clean title
function cleanTitle(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/(Offer Price|Deal Price|Price):.*$/i, "")
    .trim();
}

// ✅ Offer price
function extractOfferPrice(text) {
  const match = text.match(
    /(Offer Price|Deal Price|Price):\s*₹\s*([\d,]+)/i
  );
  return match ? parseInt(match[2].replace(/,/g, "")) : null;
}

// ✅ Filter
function isValidGold(title) {
  const t = title.toLowerCase();

  return (
    (t.includes("24k")||t.includes("24 k") || t.includes("999")) &&
    t.includes("gold") &&
    getWeight(title) &&
    !t.includes("995") &&
    !t.includes("silver") &&
    !t.includes("plated")
  );
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ✅ Scroll
async function autoScroll(page) {
  let prev = 0;

  for (let i = 0; i < 10; i++) {
    const curr = await page.evaluate(() => document.body.scrollHeight);
    if (curr === prev) break;

    prev = curr;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500);
  }
}

// ✅ SCRAPE SINGLE URL
async function scrapePage(page, url) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await delay(3000);
  await autoScroll(page);
  await delay(2000);

  const items = await page.evaluate(() => {
    const anchors = document.querySelectorAll("a[href*='/p/']");
    const results = [];

    anchors.forEach((el) => {
      const text = el.innerText || "";
      const link = el.href;

      if (!text.toLowerCase().includes("gold")) return;

      results.push({
        rawText: text,
        link: link.startsWith("http")
          ? link
          : "https://www.ajio.com" + link,
      });
    });

    return results;
  });

  return items;
}

// ✅ MAIN SCRAPER (MULTI URL)
async function getGoldProducts() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    let allItems = [];

    for (const url of URLS) {
      console.log("🔎 Scraping:", url);

      try {
        const items = await scrapePage(page, url);
        allItems.push(...items);
      } catch (err) {
        console.log("⚠️ Failed:", url);
      }
    }

    const products = [];

    for (const item of allItems) {
      const price = extractOfferPrice(item.rawText);
      if (!price) continue;

      const title = cleanTitle(item.rawText);

      products.push({
        title,
        price,
        link: item.link,
      });
    }

    return products;
  } finally {
    await browser.close();
  }
}

// ✅ Format message
function formatMessage(bestByWeight) {
  let msg = "🔥 *GOLD PRICE ALERT* 🔥\n\n";

  for (const weight of WEIGHTS) {
    const deal = bestByWeight[weight];

    if (deal) {
      msg += `🏆 *${weight.toUpperCase()}*\n`;
      msg += `💰 ₹${deal.price.toLocaleString("en-IN")}\n`;
      msg += `📦 ${deal.title.slice(0, 90)}\n`;
      msg += `🔗 [Buy Now](${deal.link})\n\n`;
    } else {
      msg += `🏆 *${weight.toUpperCase()}*\n`;
      msg += `❌ No deal available\n\n`;
    }
  }

  msg += "━━━━━━━━━━━━━━━";

  return msg;
}

// ✅ Telegram
async function sendAlert(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await Promise.all(
    CHAT_IDS.map((chatId) =>
      axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      })
    )
  );

  console.log("✅ Alert sent");
}

// ✅ MAIN
async function main() {
  try {
    console.log("⏳ Checking price...");

    const products = await getGoldProducts();

    const filtered = products.filter((p) => isValidGold(p.title));

    if (filtered.length === 0) {
      console.log("❌ No matching coins");
      return;
    }

    const bestByWeight = {};

    for (const p of filtered) {
      const weight = getWeight(p.title);
      if (!weight) continue;

      if (!bestByWeight[weight] || p.price < bestByWeight[weight].price) {
        bestByWeight[weight] = p;
      }
    }

    for (const w of WEIGHTS) {
      if (bestByWeight[w] && bestByWeight[w].price > TARGET_PRICE) {
        delete bestByWeight[w];
      }
    }

    if (Object.keys(bestByWeight).length === 0) {
      console.log("ℹ️ No deals under target");
      return;
    }

    const message = formatMessage(bestByWeight);

    await sendAlert(message);

    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();