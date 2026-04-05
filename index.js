const puppeteer = require("puppeteer");
const axios = require("axios");

const URL = "https://www.ajio.com/search/?text=gold%20coin";
const TARGET_PRICE = 330000;

// ✅ CONFIGURABLE WEIGHTS (ORDER MATTERS)
const WEIGHTS = ["0.5 gm", "1 gm", "2 gm"];

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS.split(",");

// ✅ Extract weight
function getWeight(title) {
  title = title.toLowerCase();
  return WEIGHTS.find((w) => title.includes(w)) || null;
}

// ✅ Filter valid gold
function isValidGold(title) {
  title = title.toLowerCase();

  return (
    (title.includes("24k") || title.includes("999")) &&
    title.includes("gold") &&
    getWeight(title) &&
    !title.includes("995") &&
    !title.includes("silver") &&
    !title.includes("plated") &&
    !title.includes("+")
  );
}

// ✅ Delay helper
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ✅ Scroll
async function autoScroll(page) {
  let previousHeight = 0;

  for (let i = 0; i < 10; i++) {
    const currentHeight = await page.evaluate(
      () => document.body.scrollHeight
    );

    if (currentHeight === previousHeight) break;

    previousHeight = currentHeight;

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await delay(1500);
  }
}

// ✅ Scrape
async function getGoldProducts() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await delay(3000);
    await autoScroll(page);
    await delay(2000);

    const texts = await page.evaluate(() => {
      const all = document.querySelectorAll("div");
      let result = [];

      all.forEach((el) => {
        const text = el.innerText || "";
        if (text.toLowerCase().includes("gold")) {
          result.push(text);
        }
      });

      return result;
    });

    const products = [];

    for (const text of texts) {
      const priceMatch = text.match(/Offer Price:\s*₹\s*([\d,]+)/i);
      if (priceMatch) {
        products.push({
          title: text.replace(/\n/g, " ").trim(),
          price: parseInt(priceMatch[1].replace(/,/g, "")),
        });
      }
    }

    return products;
  } finally {
    await browser.close();
  }
}

// ✅ Format message nicely
function formatMessage(bestByWeight) {
  let msg = "🔥 *GOLD PRICE ALERT* 🔥\n\n";

  for (const weight of WEIGHTS) {
    const deal = bestByWeight[weight];

    if (deal) {
      msg += `🏆 *${weight.toUpperCase()}*\n`;
      msg += `💰 ₹${deal.price.toLocaleString("en-IN")}\n`;
      msg += `📦 ${deal.title.slice(0, 120)}...\n\n`;
    } else {
      msg += `🏆 *${weight.toUpperCase()}*\n`;
      msg += `❌ No deal found\n\n`;
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

// ✅ Main
async function main() {
  try {
    console.log("⏳ Checking price...");

    const products = await getGoldProducts();

    const filtered = products.filter((p) => isValidGold(p.title));

    if (filtered.length === 0) {
      console.log("❌ No matching coins");
      return;
    }

    // ✅ Find cheapest per weight
    const bestByWeight = {};

    for (const product of filtered) {
      const weight = getWeight(product.title);
      if (!weight) continue;

      if (
        !bestByWeight[weight] ||
        product.price < bestByWeight[weight].price
      ) {
        bestByWeight[weight] = product;
      }
    }

    // ✅ Apply target price filter
    for (const weight of WEIGHTS) {
      if (
        bestByWeight[weight] &&
        bestByWeight[weight].price > TARGET_PRICE
      ) {
        delete bestByWeight[weight];
      }
    }

    if (Object.keys(bestByWeight).length === 0) {
      console.log("ℹ️ No deals under target price");
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

// ✅ Run once
main();