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

  await page.locator("[data-action=switch-user]").selectOption("emp-neel");
  await page.locator("[data-section=checkins]").click();
  await page.locator("[data-action=save-updates]").click();
  const timelineValidationVisible = await page.getByText("Completion date is required for timeline goals.").isVisible();

  await page.locator('[data-update-goal-id="goal-neel-3"][data-update-field="completionDate"]').fill("2026-08-10");
  await page.locator('[data-update-goal-id="goal-neel-3"][data-update-field="status"]').selectOption("Completed");
  await page.locator("[data-action=save-updates]").click();

  await page.locator("[data-action=switch-user]").selectOption("mgr-ravi");
  await page.locator("[data-section=team]").click();
  const plannedVsActual = await page.evaluate(() => ({
    hasGoalLevelSection: document.body.textContent.includes("planned vs actual"),
    hasPlannedTargetColumn: document.body.textContent.includes("Planned target"),
    hasActualColumn: document.body.textContent.includes("Actual achievement"),
    hasTimelineActual: document.body.textContent.includes("2026-08-10"),
    hasQuarterNotice: document.body.textContent.includes("Active capture window"),
  }));

  await page.locator("[data-section=checkins]").click();
  await page.locator('[data-checkin-employee="emp-neel"][data-checkin-field="summary"]').fill("Reviewed Q1 actuals against planned targets.");
  await page.locator('[data-checkin-employee="emp-neel"][data-checkin-field="blockers"]').fill("No major blockers.");
  await page.locator('[data-checkin-employee="emp-neel"][data-checkin-field="nextActions"]').fill("Keep completion evidence updated before Q2.");
  await page.locator('[data-action="save-checkin"][data-employee-id="emp-neel"]').click();

  const structuredCheckIn = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("atomquest-goal-portal-state"));
    const checkIn = state.checkIns.find((item) => item.employeeId === "emp-neel" && item.quarter === "Q1");
    return {
      summary: checkIn?.summary,
      blockers: checkIn?.blockers,
      nextActions: checkIn?.nextActions,
      hasStructuredFields: ["summary", "blockers", "nextActions"].every((field) => field in checkIn),
    };
  });

  await browser.close();

  const result = { timelineValidationVisible, plannedVsActual, structuredCheckIn, errors };
  console.log(JSON.stringify(result, null, 2));

  if (
    errors.length ||
    !timelineValidationVisible ||
    !plannedVsActual.hasGoalLevelSection ||
    !plannedVsActual.hasPlannedTargetColumn ||
    !plannedVsActual.hasActualColumn ||
    !plannedVsActual.hasTimelineActual ||
    !plannedVsActual.hasQuarterNotice ||
    !structuredCheckIn.hasStructuredFields ||
    structuredCheckIn.summary !== "Reviewed Q1 actuals against planned targets." ||
    structuredCheckIn.blockers !== "No major blockers." ||
    structuredCheckIn.nextActions !== "Keep completion evidence updated before Q2."
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
