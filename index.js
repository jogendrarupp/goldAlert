const axios = require("axios");
const cheerio = require("cheerio");

const URL = "https://www.ajio.com/search/?text=gold%20coin";
const TARGET_PRICE = 15000; // set your target
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

function isValidGold(title) {
  title = title.toLowerCase();

  return (
    (title.includes("24k") || title.includes("999")) &&
    title.includes("gold") &&
    title.includes("2 g") &&
    !title.includes("silver") &&
    !title.includes("plated")
  );
}

async function getGoldPrice() {
  const res = await axios.get(URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(res.data);
  let matched = [];

  $(".nameCls").each((i, el) => {
    const title = $(el).text();

    if (isValidGold(title)) {
      const priceText = $(el)
        .closest(".item")
        .find(".price")
        .text()
        .replace(/[₹,]/g, "");

      const price = parseInt(priceText);

      if (!isNaN(price)) {
        matched.push({ title, price });
      }
    }
  });

  return matched;
}

async function sendAlert(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await axios.post(url, {
    chat_id: CHAT_ID,
    text: message,
  });
}

async function main() {
  const products = await getGoldPrice();

  if (products.length === 0) {
    console.log("No matching products found");
    return;
  }

  const best = products.sort((a, b) => a.price - b.price)[0];

  console.log("Best:", best);

  if (best.price <= TARGET_PRICE) {
    await sendAlert(
      `🔥 Price Drop!\n${best.title}\n₹${best.price}`
    );
  }
}

main();