const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
  await page.locator("[data-action=reset-demo]").click();
  await page.locator("[data-action=switch-user]").selectOption("mgr-ravi");
  await page.locator("[data-section=approvals]").click();
  await page.getByRole("button", { name: "Approve and lock" }).click();
  await page.locator("[data-action=switch-user]").selectOption("admin-hr");
  await page.locator("[data-section=reports]").click();

  const exportVisible = await page.getByText("Export CSV").isVisible();
  console.log(`manager-admin-flow=${exportVisible ? "ok" : "missing"}`);
  console.log(`errors=${JSON.stringify(errors)}`);
  await browser.close();

  if (!exportVisible || errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
