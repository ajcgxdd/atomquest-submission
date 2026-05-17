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

  await page.locator("[data-action=switch-user]").selectOption("emp-asha");
  await page.locator("[data-section=goals]").click();
  const employeeDraftCreation = await page.evaluate(() => ({
    addEnabled: !document.querySelector("[data-action=add-goal]").disabled,
    submitEnabled: !document.querySelector("[data-action=submit-goals]").disabled,
    inputEditable: [...document.querySelectorAll(".goal-card [data-goal-field]")].some((node) => !node.disabled),
    initialGoalCards: document.querySelectorAll(".goal-card").length,
  }));
  await page.locator("[data-action=add-goal]").click();
  employeeDraftCreation.afterAddGoalCards = await page.locator(".goal-card").count();

  await page.locator("[data-action=switch-user]").selectOption("mgr-ravi");
  await page.locator("[data-section=shared]").click();
  const managerSharedForm = await page.evaluate(() => ({
    hasSharedPage: document.body.textContent.includes("Shared goals"),
    recipientBadge: document.body.textContent.includes("3 recipients"),
    uomOptions: [...document.querySelectorAll("[data-shared-field=uomUnit] option")].map((option) => option.textContent),
  }));

  await page.locator("[data-shared-field=title]").fill("Department pipeline hygiene");
  await page.locator("[data-shared-field=target]").fill("100");
  await page.locator("[data-shared-field=description]").fill("Maintain a clean departmental pipeline KPI.");
  await page.locator("[data-shared-field=weightage]").fill("10");
  await page.locator("[data-action=push-shared-goal]").click();

  await page.locator("[data-action=switch-user]").selectOption("emp-asha");
  await page.locator("[data-section=goals]").click();
  const sharedGoalLocks = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".goal-card")].find((node) => node.textContent.includes("Department pipeline hygiene"));
    if (!card) return { found: false };
    const fields = Object.fromEntries(
      [...card.querySelectorAll("[data-goal-field]")].map((node) => [node.dataset.goalField, node.disabled])
    );
    return {
      found: true,
      fields,
      removeDisabled: card.querySelector("[data-action=delete-goal]").disabled,
    sharedNotice: document.body.textContent.includes("Shared KPI: recipients can adjust weightage only"),
  };
  });

  await browser.close();

  const result = { employeeDraftCreation, managerSharedForm, sharedGoalLocks, errors };
  console.log(JSON.stringify(result, null, 2));

  const hasUomOptions = ["Numeric", "%", "Timeline", "Zero-based"].every((label) => managerSharedForm.uomOptions.includes(label));
  const locksOk =
    sharedGoalLocks.found &&
    sharedGoalLocks.fields.weightage === false &&
    sharedGoalLocks.fields.title === true &&
    sharedGoalLocks.fields.target === true &&
    sharedGoalLocks.fields.thrustArea === true &&
    sharedGoalLocks.fields.description === true &&
    sharedGoalLocks.fields.uomUnit === true &&
    sharedGoalLocks.fields.uomType === true &&
    sharedGoalLocks.removeDisabled === true;

  if (
    errors.length ||
    !employeeDraftCreation.addEnabled ||
    !employeeDraftCreation.submitEnabled ||
    !employeeDraftCreation.inputEditable ||
    employeeDraftCreation.afterAddGoalCards !== employeeDraftCreation.initialGoalCards + 1 ||
    !managerSharedForm.hasSharedPage ||
    !managerSharedForm.recipientBadge ||
    !hasUomOptions ||
    !locksOk ||
    !sharedGoalLocks.sharedNotice
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
