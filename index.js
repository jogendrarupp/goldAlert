const puppeteer = require("puppeteer");
const axios = require("axios");

const URL = "https://www.ajio.com/search/?text=gold%20coin";
const TARGET_PRICE = 33000;

// ✅ Use env variables (IMPORTANT for Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let lastAlertPrice = null;

// ✅ Filter only 2gm 24K 999 coins
function isValidGold(title) {
  title = title.toLowerCase();

  return (
    (title.includes("24k") || title.includes("999")) &&
    title.includes("gold") &&
    title.includes("2 gm") &&
    !title.includes("995") &&
    !title.includes("silver") &&
    !title.includes("plated") &&
    !title.includes("+")
  );
}

// ✅ Extract Offer Price
function extractOfferPrice(text) {
  const match = text.match(/Offer Price:\s*₹\s*([\d,]+)/i);
  return match ? parseInt(match[1].replace(/,/g, "")) : null;
}

// ✅ Smart scroll (limited)
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

    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ✅ Scrape products
async function getGoldProducts() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  await new Promise((r) => setTimeout(r, 3000));

  await autoScroll(page);

  await new Promise((r) => setTimeout(r, 2000));

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

  await browser.close();

  const products = [];

  for (const text of texts) {
    const price = extractOfferPrice(text);
    if (price) {
      products.push({ title: text, price });
    }
  }

  return products;
}

// ✅ Telegram alert
async function sendAlert(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await axios.post(url, {
    chat_id: CHAT_ID,
    text: message,
  });
}

// ✅ Main logic
async function main() {
  try {
    console.log("⏳ Checking price...");

    const products = await getGoldProducts();
    const filtered = products.filter((p) => isValidGold(p.title));

    if (filtered.length === 0) {
      console.log("❌ No matching coins");
      return;
    }

    const best = filtered.sort((a, b) => a.price - b.price)[0];

    console.log("✅ Best:", best.price);

    if (
      best.price <= TARGET_PRICE &&
      best.price !== lastAlertPrice
    ) {
      lastAlertPrice = best.price;

      await sendAlert(
        `🔥 PRICE DROP!\n\n💰 ₹${best.price}\n\n${best.title}`
      );

      console.log("✅ Alert sent");
    } else {
      console.log("ℹ️ No alert");
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ✅ Render-friendly loop
(async () => {
  while (true) {
    await main();

    console.log("⏱ Waiting 30 mins...");
    await new Promise((r) => setTimeout(r, 1800000)); // 30 min
  }
})();