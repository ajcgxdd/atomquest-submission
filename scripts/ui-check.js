const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.locator("[data-action=reset-demo]").click();

  const overview = await page.evaluate(() => {
    const metricHeights = [...document.querySelectorAll(".metric")].map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      metricCount: metricHeights.length,
      metricHeights,
      pageTitleHeight: Math.round(document.querySelector(".page-title").getBoundingClientRect().height),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  await page.locator("[data-section=goals]").click();
  const goals = await page.evaluate(() => ({
    goalCards: document.querySelectorAll(".goal-card").length,
    narrowInputs: [...document.querySelectorAll(".goal-card .input, .goal-card .select")].filter((node) => node.getBoundingClientRect().width < 120).length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  await page.locator("[data-action=switch-user]").selectOption("admin-hr");
  const admin = await page.evaluate(() => ({
    metricCount: document.querySelectorAll(".metric").length,
    tableCount: document.querySelectorAll(".table-wrap").length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  await browser.close();

  const result = { overview, goals, admin, errors };
  console.log(JSON.stringify(result, null, 2));

  if (
    errors.length ||
    overview.metricCount !== 4 ||
    goals.goalCards < 1 ||
    goals.narrowInputs > 0 ||
    overview.horizontalOverflow ||
    goals.horizontalOverflow ||
    admin.horizontalOverflow
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
