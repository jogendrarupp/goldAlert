const puppeteer = require("puppeteer");
const axios = require("axios");

const URL = "https://www.ajio.com/search/?text=gold%20coin";
const TARGET_PRICE = 33000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS.split(",");

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

// ✅ Delay helper (CI-safe)
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

    // ✅ Anti-403 setup
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

    await delay(3000); // ✅ SAFE (replaces waitForTimeout)

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
      const price = text.match(/Offer Price:\s*₹\s*([\d,]+)/i);
      if (price) {
        products.push({
          title: text,
          price: parseInt(price[1].replace(/,/g, "")),
        });
      }
    }

    return products;
  } finally {
    await browser.close();
  }
}

// ✅ Telegram
async function sendAlert(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await Promise.all(
    CHAT_IDS.map((chatId) =>
      axios.post(url, {
        chat_id: chatId,
        text: message,
      })
    )
  );

  console.log("✅ Sent to all users");
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

    const best = filtered.sort((a, b) => a.price - b.price)[0];

    console.log("✅ Best price:", best.price);

    if (best.price <= TARGET_PRICE) {
      await sendAlert(
        `🔥 PRICE DROP!\n\n💰 ₹${best.price}\n\n${best.title}`
      );
      console.log("✅ Alert sent");
    } else {
      console.log("ℹ️ No alert");
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

// ✅ Run once (IMPORTANT for GitHub Actions)
main();