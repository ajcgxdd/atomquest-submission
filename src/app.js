import { quarters, thrustAreas, uomTypes, uomUnits } from "./data.js";
import { calculateProgress, formatScore, weightedScore } from "./scoring.js";
import { loadState, resetState, saveState, uid } from "./store.js";

let state = loadState();
if (state.meta?.schemaVersion !== "phase2-v1") {
  state = resetState();
}
let currentUserId = localStorage.getItem("atomquest-current-user") || "emp-asha";
let currentSection = localStorage.getItem("atomquest-current-section") || "overview";
let activeQuarter = localStorage.getItem("atomquest-active-quarter") || state.meta.activeQuarter;

const root = document.querySelector("#app");

const navByRole = {
  employee: [
    ["overview", "Overview"],
    ["goals", "Goal Sheet"],
    ["checkins", "Quarterly Updates"],
  ],
  manager: [
    ["overview", "Overview"],
    ["approvals", "Approvals"],
    ["team", "Team Progress"],
    ["checkins", "Check-ins"],
    ["shared", "Shared Goals"],
  ],
  admin: [
    ["overview", "Overview"],
    ["cycles", "Cycles"],
    ["shared", "Shared Goals"],
    ["reports", "Reports"],
    ["audit", "Audit Trail"],
  ],
};

const sharedGoalReadOnlyFields = ["thrustArea", "title", "description", "uomUnit", "uomType", "target"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentUser() {
  return state.users.find((user) => user.id === currentUserId) || state.users[0];
}

function setState(nextState = state) {
  state = nextState;
  saveState(state);
  render();
}

function userName(userId) {
  return state.users.find((user) => user.id === userId)?.name || "Unknown";
}

function employeeUsers() {
  return state.users.filter((user) => user.role === "employee");
}

function teamForManager(managerId) {
  return state.users.filter((user) => user.managerId === managerId);
}

function sharedGoalRecipientsFor(user) {
  return user.role === "manager" ? teamForManager(user.id) : employeeUsers();
}

function inferUomUnit(goal) {
  if (goal.uomUnit) return goal.uomUnit;
  if (goal.uomType === "TIMELINE") return "TIMELINE";
  if (goal.uomType === "ZERO") return "ZERO";
  return "NUMERIC";
}

function formulaOptionsForUnit(unit) {
  if (unit === "TIMELINE") return uomTypes.filter((type) => type.id === "TIMELINE");
  if (unit === "ZERO") return uomTypes.filter((type) => type.id === "ZERO");
  return uomTypes.filter((type) => type.id === "MIN" || type.id === "MAX");
}

function normalizeGoalMeasurement(goal) {
  const unit = inferUomUnit(goal);
  const allowed = formulaOptionsForUnit(unit).map((type) => type.id);
  if (!allowed.includes(goal.uomType)) {
    goal.uomType = allowed[0];
  }
  goal.uomUnit = unit;
}

function isEmployeeEditableSheet(sheet) {
  return Boolean(sheet && !sheet.locked && (sheet.status === "DRAFT" || sheet.status === "RETURNED"));
}

function sheetForEmployee(employeeId) {
  return state.goalSheets.find((sheet) => sheet.employeeId === employeeId && sheet.cycleId === state.meta.activeCycleId);
}

function goalsForSheet(sheetId) {
  return state.goals.filter((goal) => goal.sheetId === sheetId);
}

function updateForGoal(goalId, quarter = activeQuarter) {
  return state.goalUpdates.find((update) => update.goalId === goalId && update.quarter === quarter);
}

function ensureSheet(employeeId) {
  let sheet = sheetForEmployee(employeeId);
  if (sheet) return sheet;

  const employee = state.users.find((user) => user.id === employeeId);
  sheet = {
    id: uid("sheet"),
    employeeId,
    managerId: employee.managerId,
    cycleId: state.meta.activeCycleId,
    status: "DRAFT",
    locked: false,
    managerNote: "",
    updatedAt: new Date().toISOString(),
  };
  state.goalSheets.push(sheet);
  audit(currentUserId, "GoalSheet", sheet.id, "CREATED", "Goal sheet draft created.");
  return sheet;
}

function audit(actorId, entity, entityId, action, detail) {
  state.auditLogs.unshift({
    id: uid("audit"),
    actorId,
    entity,
    entityId,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}

function statusBadge(status) {
  const map = {
    DRAFT: "amber",
    RETURNED: "rose",
    SUBMITTED: "blue",
    APPROVED: "green",
    "Not Started": "amber",
    "On Track": "blue",
    Completed: "green",
  };
  return `<span class="badge ${map[status] || ""}">${escapeHtml(status)}</span>`;
}

function validateGoals(goals) {
  const errors = [];
  const total = goals.reduce((sum, goal) => sum + Number(goal.weightage || 0), 0);
  if (!goals.length) errors.push("Add at least one goal before submission.");
  if (goals.length > 8) errors.push("Maximum 8 goals are allowed.");
  if (total !== 100) errors.push(`Total weightage must equal 100%. Current total is ${total}%.`);
  goals.forEach((goal, index) => {
    if (Number(goal.weightage) < 10) errors.push(`Goal ${index + 1} must have at least 10% weightage.`);
    if (!goal.title.trim()) errors.push(`Goal ${index + 1} needs a title.`);
    if (!String(goal.target).trim()) errors.push(`Goal ${index + 1} needs a target.`);
  });
  return errors;
}

function activeQuarterInfo() {
  return quarters.find((quarter) => quarter.id === activeQuarter) || quarters[0];
}

function renderQuarterWindowNotice() {
  const quarter = activeQuarterInfo();
  return `<div class="notice">Active capture window: ${escapeHtml(quarter.label)} opens in ${escapeHtml(quarter.window)}. Required action: ${escapeHtml(quarter.action)}.</div>`;
}

function hasUpdateValue(goal, update) {
  if (!update) return false;
  if (goal.uomType === "TIMELINE") return Boolean(update.completionDate);
  return update.actual !== undefined && update.actual !== "";
}

function actualDisplay(goal, update) {
  if (!update) return "Pending";
  if (goal.uomType === "TIMELINE") return update.completionDate || "Pending";
  return update.actual || "Pending";
}

function validateGoalUpdate(goal, update, requireValue = false) {
  const errors = [];
  if (!requireValue && !hasUpdateValue(goal, update)) return errors;

  if (goal.uomType === "TIMELINE") {
    if (!update?.completionDate) errors.push("Completion date is required for timeline goals.");
    return errors;
  }

  if (!update || update.actual === "") {
    errors.push("Actual achievement is required.");
    return errors;
  }

  const actual = Number(update.actual);
  if (!Number.isFinite(actual)) errors.push("Actual achievement must be a number.");
  if (Number.isFinite(actual) && actual < 0) errors.push("Actual achievement cannot be negative.");
  if (inferUomUnit(goal) === "PERCENT" && Number.isFinite(actual) && actual > 100) errors.push("Percentage actual cannot exceed 100.");
  if (goal.uomType === "ZERO" && Number.isFinite(actual) && !Number.isInteger(actual)) errors.push("Zero-based actual must be a whole number.");
  return errors;
}

function updateValidationKey() {
  return `${currentUserId}-${activeQuarter}`;
}

function render() {
  const user = currentUser();
  const nav = navByRole[user.role];
  if (!nav.some(([id]) => id === currentSection)) currentSection = "overview";

  root.innerHTML = `
    <div class="app-shell">
      <div class="shape shape-blue" aria-hidden="true"></div>
      <div class="shape shape-amber" aria-hidden="true"></div>
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">AQ</div>
          <div>
            <h1>AtomQuest Goal Portal</h1>
            <p>Goal setting, approvals, check-ins, and governance</p>
          </div>
        </div>
        <div class="role-tools">
          <select class="select" data-action="switch-user" aria-label="Switch demo user">
            ${state.users.map((item) => `<option value="${item.id}" ${item.id === user.id ? "selected" : ""}>${escapeHtml(item.name)} - ${item.role}</option>`).join("")}
          </select>
          <button class="button secondary" data-action="reset-demo">Reset demo</button>
        </div>
      </header>
      <main class="main">
        <aside class="sidebar">
          <section class="user-card">
            <div class="avatar">${escapeHtml(user.name.split(" ").map((part) => part[0]).join(""))}</div>
            <strong>${escapeHtml(user.name)}</strong>
            <p class="muted">${escapeHtml(user.department)}</p>
            ${statusBadge(user.role.toUpperCase())}
          </section>
          <nav class="nav" aria-label="Role navigation">
            ${nav.map(([id, label]) => `<button class="${id === currentSection ? "active" : ""}" data-action="section" data-section="${id}"><span>${label}</span><span>›</span></button>`).join("")}
          </nav>
        </aside>
        <section class="content">
          ${renderPage(user)}
        </section>
      </main>
    </div>
  `;
}

function renderPage(user) {
  if (user.role === "employee") return renderEmployee(user);
  if (user.role === "manager") return renderManager(user);
  return renderAdmin(user);
}

function renderTitle(title, subtitle, action = "") {
  return `
    <div class="page-title">
      <div>
        <span class="eyebrow">${escapeHtml(state.cycles[0]?.name || "Active cycle")} / ${escapeHtml(activeQuarter)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      ${action}
    </div>
  `;
}

function renderEmployee(user) {
  if (currentSection === "goals") return renderEmployeeGoals(user);
  if (currentSection === "checkins") return renderEmployeeUpdates(user);
  return renderEmployeeOverview(user);
}

function renderEmployeeOverview(user) {
  const sheet = sheetForEmployee(user.id);
  const goals = sheet ? goalsForSheet(sheet.id) : [];
  const totalWeight = goals.reduce((sum, goal) => sum + Number(goal.weightage || 0), 0);
  const score = weightedScore(goals, state.goalUpdates, activeQuarter);

  return `
    ${renderTitle("Employee workspace", "Create goals, track quarterly achievement, and stay aligned with your manager.")}
    <div class="grid four">
      ${metric("Goal status", sheet?.status || "Not started", "Current sheet state", "mint")}
      ${metric("Goals", goals.length, "Maximum 8 allowed", "blue")}
      ${metric("Weightage", `${totalWeight}%`, "Must equal 100%", "peach")}
      ${metric("Progress", formatScore(score), `${activeQuarter} weighted score`, "lavender")}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Quarterly schedule</h2>
          <p class="muted">Windows from the problem statement are built into the workflow.</p>
        </div>
      </div>
      ${renderSchedule()}
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Next action</h2>
          <p class="muted">The portal guides users to the next incomplete step.</p>
        </div>
      </div>
      ${employeeNextAction(sheet)}
    </section>
  `;
}

function employeeNextAction(sheet) {
  if (!sheet) return `<div class="notice warn">Create your first goal sheet and submit it for manager approval.</div>`;
  if (sheet.status === "DRAFT") return `<div class="notice warn">Finish goal setup. Your total weightage must be exactly 100% before submission.</div>`;
  if (sheet.status === "RETURNED") return `<div class="notice error">Manager returned this sheet: ${escapeHtml(sheet.managerNote || "Please rework and resubmit.")}</div>`;
  if (sheet.status === "SUBMITTED") return `<div class="notice">Your goals are with ${escapeHtml(userName(sheet.managerId))} for approval.</div>`;
  return `<div class="notice">Your approved goals are locked. Further goal-sheet edits require Admin unlock from the completion dashboard.</div>`;
}

function renderEmployeeGoals(user) {
  const sheet = ensureSheet(user.id);
  const goals = goalsForSheet(sheet.id);
  const errors = validateGoals(goals);
  const editable = isEmployeeEditableSheet(sheet);

  return `
    ${renderTitle("Goal sheet", "Define thrust areas, targets, measurements, and weightage before manager approval.", `
      <div class="actions">
        <button class="button soft" data-action="add-goal" ${!editable || goals.length >= 8 ? "disabled" : ""}>Add goal</button>
        <button class="button" data-action="submit-goals" ${!editable ? "disabled" : ""}>Submit</button>
      </div>
    `)}
    ${sheet.status === "RETURNED" ? `<div class="notice error">Returned for rework: ${escapeHtml(sheet.managerNote)}</div>` : ""}
    ${sheet.status === "SUBMITTED" ? `<div class="notice">Submitted goal sheets are read-only for employees while Manager review is pending.</div>` : ""}
    ${sheet.locked ? `<div class="notice">Approved goal sheets are locked. Only Admin can unlock this sheet for exception handling.</div>` : ""}
    ${errors.length && editable ? `<div class="notice warn">${errors.map(escapeHtml).join("<br>")}</div>` : ""}
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Goals</h2>
          <p class="muted">${goals.length} of 8 goals. Total weightage ${goals.reduce((sum, goal) => sum + Number(goal.weightage || 0), 0)}%.</p>
        </div>
        ${statusBadge(sheet.status)}
      </div>
      ${goals.length ? renderGoalEditor(goals, !editable) : `<div class="empty"><h3>No goals yet</h3><p>Add goals to start the approval workflow.</p></div>`}
    </section>
  `;
}

function renderGoalEditor(goals, locked, managerMode = false) {
  return `
    <div class="goal-stack">
      ${goals.map((goal, index) => {
        normalizeGoalMeasurement(goal);
        const uomUnit = inferUomUnit(goal);
        const formulaOptions = formulaOptionsForUnit(uomUnit);
        const sharedLocked = Boolean(goal.sharedGoalId);
        const contentLocked = locked || sharedLocked || managerMode;
        const titleLocked = contentLocked || goal.readOnlyFields?.includes("title");
        const targetLocked = locked || sharedLocked || goal.readOnlyFields?.includes("target");
        const removeLocked = locked || sharedLocked || managerMode;
        return `
          <article class="goal-card">
            <div class="goal-card-header">
              <div>
                <span class="eyebrow">Goal ${index + 1}</span>
                <h3>${escapeHtml(goal.title || "Untitled goal")}</h3>
              </div>
              <div class="actions">
                ${statusBadge(goal.status)}
                <button class="button small danger" data-action="delete-goal" data-goal-id="${goal.id}" ${removeLocked ? "disabled" : ""}>Remove</button>
              </div>
            </div>
            <div class="goal-form-grid">
              <label class="field">
                <span>Thrust area</span>
                <select class="select" data-goal-id="${goal.id}" data-goal-field="thrustArea" ${contentLocked ? "disabled" : ""}>
                  ${thrustAreas.map((area) => `<option value="${area}" ${area === goal.thrustArea ? "selected" : ""}>${area}</option>`).join("")}
                </select>
              </label>
              <label class="field goal-title-field">
                <span>Title</span>
                <input class="input" value="${escapeHtml(goal.title)}" data-goal-id="${goal.id}" data-goal-field="title" ${titleLocked ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>UoM</span>
                <select class="select" data-goal-id="${goal.id}" data-goal-field="uomUnit" ${contentLocked ? "disabled" : ""}>
                  ${uomUnits.map((unit) => `<option value="${unit.id}" ${unit.id === uomUnit ? "selected" : ""}>${unit.label}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>Progress rule</span>
                <select class="select" data-goal-id="${goal.id}" data-goal-field="uomType" ${contentLocked ? "disabled" : ""}>
                  ${formulaOptions.map((type) => `<option value="${type.id}" ${type.id === goal.uomType ? "selected" : ""}>${type.label}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>Target</span>
                <input class="input" value="${escapeHtml(goal.target)}" data-goal-id="${goal.id}" data-goal-field="target" ${targetLocked ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>Weightage</span>
                <input class="input" type="number" min="10" max="100" value="${escapeHtml(goal.weightage)}" data-goal-id="${goal.id}" data-goal-field="weightage" ${locked ? "disabled" : ""} />
              </label>
              <label class="field wide">
                <span>Description</span>
                <textarea class="textarea" data-goal-id="${goal.id}" data-goal-field="description" ${contentLocked ? "disabled" : ""}>${escapeHtml(goal.description)}</textarea>
              </label>
            </div>
            ${goal.sharedGoalId ? `<p class="mini shared-note">Shared KPI: recipients can adjust weightage only. Title, description, UoM, thrust area, progress rule, and target are read-only.</p>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderEmployeeUpdates(user) {
  const sheet = sheetForEmployee(user.id);
  const goals = sheet ? goalsForSheet(sheet.id) : [];
  const approved = sheet?.status === "APPROVED";

  return `
    ${renderTitle("Quarterly updates", "Log actual achievement and status during the active check-in window.", renderQuarterSelect())}
    ${renderQuarterWindowNotice()}
    ${approved ? "" : `<div class="notice warn">Quarterly updates open after manager approval.</div>`}
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${activeQuarter} achievement capture</h2>
          <p class="muted">Scores are computed for tracking only, not ratings.</p>
        </div>
      </div>
      ${goals.length ? renderUpdateTable(goals, !approved) : `<div class="empty"><h3>No approved goals</h3><p>Create and approve goals before achievement tracking.</p></div>`}
    </section>
  `;
}

function renderUpdateTable(goals, disabled) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Goal</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Completion date</th>
            <th>Status</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${goals.map((goal) => {
            const update = updateForGoal(goal.id) || {};
            const score = calculateProgress(goal, update);
            const actualDisabled = disabled || goal.uomType === "TIMELINE";
            const completionDisabled = disabled || goal.uomType !== "TIMELINE";
            const requireValidation = state.meta.updateValidationAttempt === updateValidationKey();
            const errors = validateGoalUpdate(goal, update, requireValidation);
            return `
              <tr>
                <td><strong>${escapeHtml(goal.title)}</strong><p class="mini">${escapeHtml(goal.thrustArea)}</p></td>
                <td>${escapeHtml(goal.target)}</td>
                <td>
                  <input class="input" value="${escapeHtml(update.actual || "")}" placeholder="${goal.uomType === "TIMELINE" ? "Use completion date" : "Actual achievement"}" data-update-goal-id="${goal.id}" data-update-field="actual" ${actualDisabled ? "disabled" : ""} />
                  ${errors.filter((error) => !error.includes("Completion date")).map((error) => `<p class="field-error">${escapeHtml(error)}</p>`).join("")}
                </td>
                <td>
                  <input class="input" type="date" value="${escapeHtml(update.completionDate || "")}" data-update-goal-id="${goal.id}" data-update-field="completionDate" ${completionDisabled ? "disabled" : ""} />
                  ${errors.filter((error) => error.includes("Completion date")).map((error) => `<p class="field-error">${escapeHtml(error)}</p>`).join("")}
                </td>
                <td>
                  <select class="select" data-update-goal-id="${goal.id}" data-update-field="status" ${disabled ? "disabled" : ""}>
                    ${["Not Started", "On Track", "Completed"].map((status) => `<option value="${status}" ${(update.status || goal.status) === status ? "selected" : ""}>${status}</option>`).join("")}
                  </select>
                </td>
                <td><strong>${formatScore(score)}</strong><div class="progress-bar"><span style="width:${Math.min(score || 0, 100)}%"></span></div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions form-actions">
      <button class="button" data-action="save-updates" ${disabled ? "disabled" : ""}>Save updates</button>
    </div>
  `;
}

function renderManager(user) {
  if (currentSection === "approvals") return renderManagerApprovals(user);
  if (currentSection === "team") return renderManagerTeam(user);
  if (currentSection === "checkins") return renderManagerCheckins(user);
  if (currentSection === "shared") return renderSharedGoals(user);
  return renderManagerOverview(user);
}

function renderManagerOverview(user) {
  const team = teamForManager(user.id);
  const submitted = state.goalSheets.filter((sheet) => sheet.managerId === user.id && sheet.status === "SUBMITTED").length;
  const approved = state.goalSheets.filter((sheet) => sheet.managerId === user.id && sheet.status === "APPROVED").length;
  const completedCheckIns = state.checkIns.filter((item) => item.managerId === user.id && item.quarter === activeQuarter).length;

  return `
    ${renderTitle("Manager workspace", "Approve goals, monitor achievement, and document structured check-ins.")}
    <div class="grid four">
      ${metric("Team members", team.length, "Direct reports", "mint")}
      ${metric("Pending approvals", submitted, "Goal sheets awaiting review", "blue")}
      ${metric("Approved sheets", approved, "Locked after approval", "peach")}
      ${metric("Check-ins", `${completedCheckIns}/${team.length}`, `${activeQuarter} completed`, "lavender")}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Approval queue</h2>
          <p class="muted">Inline target and weightage edits are available before locking.</p>
        </div>
      </div>
      ${renderApprovalQueue(user)}
    </section>
  `;
}

function renderManagerApprovals(user) {
  return `
    ${renderTitle("Goal approvals", "Review employee submissions, edit targets or weightage, approve, or return for rework.")}
    <section class="panel">${renderApprovalQueue(user)}</section>
  `;
}

function renderApprovalQueue(user) {
  const sheets = state.goalSheets.filter((sheet) => sheet.managerId === user.id && sheet.status === "SUBMITTED");
  if (!sheets.length) return `<div class="empty"><h3>No pending approvals</h3><p>Submitted goal sheets will appear here.</p></div>`;

  return sheets.map((sheet) => {
    const goals = goalsForSheet(sheet.id);
    const errors = validateGoals(goals);
    return `
      <div class="grid approval-sheet">
        <div class="panel nested-panel">
          <div class="panel-header">
            <div>
              <h3>${escapeHtml(userName(sheet.employeeId))}</h3>
              <p class="muted">${goals.length} goals. Total weight ${goals.reduce((sum, goal) => sum + Number(goal.weightage || 0), 0)}%.</p>
            </div>
            ${statusBadge(sheet.status)}
          </div>
          ${errors.length ? `<div class="notice warn">${errors.map(escapeHtml).join("<br>")}</div>` : ""}
          ${renderGoalEditor(goals, false, true)}
          <label class="field field-spaced">
            <span>Manager note</span>
            <textarea class="textarea" data-manager-note="${sheet.id}" placeholder="Add approval or rework context">${escapeHtml(sheet.managerNote || "")}</textarea>
          </label>
          <div class="actions form-actions">
            <button class="button" data-action="approve-sheet" data-sheet-id="${sheet.id}" ${errors.length ? "disabled" : ""}>Approve and lock</button>
            <button class="button danger" data-action="return-sheet" data-sheet-id="${sheet.id}">Return for rework</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderManagerTeam(user) {
  const team = teamForManager(user.id);
  return `
    ${renderTitle("Team progress", "Compare planned targets with actual achievement across the team.", renderQuarterSelect())}
    ${renderQuarterWindowNotice()}
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Sheet</th><th>Goals</th><th>${activeQuarter} progress</th><th>Check-in</th></tr></thead>
          <tbody>
            ${team.map((employee) => {
              const sheet = sheetForEmployee(employee.id);
              const goals = sheet ? goalsForSheet(sheet.id) : [];
              const score = weightedScore(goals, state.goalUpdates, activeQuarter);
              const checkIn = state.checkIns.find((item) => item.employeeId === employee.id && item.quarter === activeQuarter);
              return `
                <tr>
                  <td><strong>${escapeHtml(employee.name)}</strong><p class="mini">${escapeHtml(employee.department)}</p></td>
                  <td>${statusBadge(sheet?.status || "NOT STARTED")}</td>
                  <td>${goals.length}</td>
                  <td><strong>${formatScore(score)}</strong><div class="progress-bar"><span style="width:${Math.min(score || 0, 100)}%"></span></div></td>
                  <td>${checkIn ? statusBadge("Completed") : statusBadge("Not Started")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
    <div class="detail-stack">
      ${team.map((employee) => renderPlannedVsActualPanel(employee)).join("")}
    </div>
  `;
}

function renderPlannedVsActualPanel(employee) {
  const sheet = sheetForEmployee(employee.id);
  const goals = sheet ? goalsForSheet(sheet.id) : [];
  if (!goals.length) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>${escapeHtml(employee.name)}</h2>
            <p class="muted">No goal sheet available for planned vs achievement review.</p>
          </div>
          ${statusBadge("Not Started")}
        </div>
      </section>
    `;
  }

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(employee.name)}: planned vs actual</h2>
          <p class="muted">Goal-level tracking for ${escapeHtml(activeQuarterInfo().label)}.</p>
        </div>
        ${statusBadge(sheet.status)}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Goal</th><th>UoM</th><th>Planned target</th><th>Actual achievement</th><th>Status</th><th>Score</th></tr></thead>
          <tbody>
            ${goals.map((goal) => {
              const update = updateForGoal(goal.id);
              const score = calculateProgress(goal, update);
              return `
                <tr>
                  <td><strong>${escapeHtml(goal.title)}</strong><p class="mini">${escapeHtml(goal.thrustArea)}</p></td>
                  <td>${escapeHtml(uomUnits.find((unit) => unit.id === inferUomUnit(goal))?.label || "Numeric")}<p class="mini">${escapeHtml(uomTypes.find((type) => type.id === goal.uomType)?.label || "")}</p></td>
                  <td>${escapeHtml(goal.target)}</td>
                  <td>${escapeHtml(actualDisplay(goal, update))}</td>
                  <td>${statusBadge(update?.status || goal.status || "Not Started")}</td>
                  <td><strong>${formatScore(score)}</strong><div class="progress-bar"><span style="width:${Math.min(score || 0, 100)}%"></span></div></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderManagerCheckins(user) {
  const team = teamForManager(user.id);
  return `
    ${renderTitle("Manager check-ins", "Document quarterly discussions with structured comments.", renderQuarterSelect())}
    ${renderQuarterWindowNotice()}
    <div class="grid two">
      ${team.map((employee) => {
        const sheet = sheetForEmployee(employee.id);
        const goals = sheet ? goalsForSheet(sheet.id) : [];
        const checkIn = state.checkIns.find((item) => item.employeeId === employee.id && item.quarter === activeQuarter) || {};
        return `
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>${escapeHtml(employee.name)}</h2>
                <p class="muted">${goals.length} goals. ${activeQuarter} progress ${formatScore(weightedScore(goals, state.goalUpdates, activeQuarter))}.</p>
              </div>
              ${checkIn.id ? statusBadge("Completed") : statusBadge("Not Started")}
            </div>
            <label class="field">
              <span>Discussion summary</span>
              <textarea class="textarea" data-checkin-employee="${employee.id}" data-checkin-field="summary" placeholder="Summarize progress and discussion">${escapeHtml(checkIn.summary || checkIn.comment || "")}</textarea>
            </label>
            <label class="field field-spaced">
              <span>Blockers</span>
              <textarea class="textarea" data-checkin-employee="${employee.id}" data-checkin-field="blockers" placeholder="Capture risks, blockers, or dependencies">${escapeHtml(checkIn.blockers || "")}</textarea>
            </label>
            <label class="field field-spaced">
              <span>Next actions</span>
              <textarea class="textarea" data-checkin-employee="${employee.id}" data-checkin-field="nextActions" placeholder="Define follow-ups before the next check-in">${escapeHtml(checkIn.nextActions || "")}</textarea>
            </label>
            <div class="actions form-actions">
              <button class="button" data-action="save-checkin" data-employee-id="${employee.id}">Save check-in</button>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderAdmin(user) {
  if (currentSection === "cycles") return renderAdminCycles();
  if (currentSection === "shared") return renderSharedGoals(user);
  if (currentSection === "reports") return renderReports();
  if (currentSection === "audit") return renderAudit();
  return renderAdminOverview();
}

function renderAdminOverview() {
  const employees = employeeUsers();
  const approved = state.goalSheets.filter((sheet) => sheet.status === "APPROVED").length;
  const submitted = state.goalSheets.filter((sheet) => sheet.status === "SUBMITTED").length;
  const checkIns = state.checkIns.filter((item) => item.quarter === activeQuarter).length;

  return `
    ${renderTitle("Admin workspace", "Govern cycles, shared KPIs, completion, reports, and exceptions.")}
    <div class="grid four">
      ${metric("Employees", employees.length, "Active participants", "mint")}
      ${metric("Approved", approved, "Locked sheets", "blue")}
      ${metric("Pending", submitted, "With managers", "peach")}
      ${metric("Check-ins", `${checkIns}/${employees.length}`, `${activeQuarter} completion`, "lavender")}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Completion dashboard</h2>
          <p class="muted">Real-time governance view for HR.</p>
        </div>
      </div>
      ${renderCompletionTable()}
    </section>
  `;
}

function renderAdminCycles() {
  return `
    ${renderTitle("Cycle management", "Configure the active cycle and enforce quarterly windows.")}
    <div class="grid two">
      <section class="panel">
        <div class="panel-header"><h2>Active cycle</h2>${statusBadge(state.cycles[0].status)}</div>
        <label class="field">
          <span>Cycle name</span>
          <input class="input" data-cycle-field="name" value="${escapeHtml(state.cycles[0].name)}" />
        </label>
        <label class="field field-spaced">
          <span>Goal setting opens</span>
          <input class="input" type="date" data-cycle-field="goalSettingOpen" value="${escapeHtml(state.cycles[0].goalSettingOpen)}" />
        </label>
        <div class="actions form-actions">
          <button class="button" data-action="save-cycle">Save cycle</button>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Escalation rules</h2></div>
        <div class="timeline">
          ${state.escalationRules.map((rule) => `
            <div class="timeline-item">
              <strong>${rule.triggerAfterDays} days</strong>
              <div><strong>${escapeHtml(rule.name)}</strong><p class="mini">${escapeHtml(rule.target)}</p></div>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-header"><h2>Check-in schedule</h2></div>
      ${renderSchedule()}
    </section>
  `;
}

function renderSharedGoals(user) {
  const recipients = sharedGoalRecipientsFor(user);
  const canPush = user.role === "admin" || user.role === "manager";
  const ownerOptions = recipients.length ? recipients : employeeUsers();
  const scopeCopy = user.role === "manager" ? "Push departmental KPIs to your direct reports." : "Push departmental KPIs to multiple employees.";
  return `
    ${renderTitle("Shared goals", `${scopeCopy} Recipients may adjust weightage only; KPI definition remains read-only.`, `
      <span class="badge blue">${recipients.length} recipients</span>
    `)}
    ${canPush ? "" : `<div class="notice warn">Only Admin and Manager roles can push shared departmental KPIs.</div>`}
    ${recipients.length ? `<div class="notice">Shared KPI fields are centrally governed. Employees can only adjust weightage before submission or after Admin unlock.</div>` : `<div class="notice warn">No eligible recipients found for this role.</div>`}
    <section class="panel">
      <div class="form-grid">
        <label class="field"><span>Title</span><input class="input" data-shared-field="title" placeholder="Department KPI title" /></label>
        <label class="field"><span>Thrust area</span><select class="select" data-shared-field="thrustArea">${thrustAreas.map((area) => `<option value="${area}">${area}</option>`).join("")}</select></label>
        <label class="field"><span>UoM</span><select class="select" data-shared-field="uomUnit">${uomUnits.map((unit) => `<option value="${unit.id}">${unit.label}</option>`).join("")}</select></label>
        <label class="field"><span>Progress rule</span><select class="select" data-shared-field="uomType">${formulaOptionsForUnit("NUMERIC").map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}</select></label>
        <label class="field"><span>Target</span><input class="input" data-shared-field="target" placeholder="Target" /></label>
        <label class="field"><span>Primary owner</span><select class="select" data-shared-field="primaryOwnerId">${ownerOptions.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Default weightage</span><input class="input" type="number" min="10" max="100" data-shared-field="weightage" value="10" /></label>
        <label class="field wide"><span>Description</span><textarea class="textarea" data-shared-field="description" placeholder="Why this KPI matters"></textarea></label>
      </div>
      <div class="actions form-actions">
        <button class="button" data-action="push-shared-goal" ${!canPush || !recipients.length ? "disabled" : ""}>Push to employees</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Published shared goals</h2></div>
      ${state.sharedGoals.length ? renderSharedGoalTable() : `<div class="empty"><h3>No shared goals yet</h3><p>Create one to demonstrate departmental KPI distribution.</p></div>`}
    </section>
  `;
}

function renderSharedGoalTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Shared goal</th><th>Owner</th><th>UoM</th><th>Target</th><th>Recipients</th></tr></thead>
        <tbody>
          ${state.sharedGoals.map((goal) => `
            <tr>
              <td><strong>${escapeHtml(goal.title)}</strong><p class="mini">${escapeHtml(goal.thrustArea)}</p></td>
              <td>${escapeHtml(userName(goal.primaryOwnerId))}</td>
              <td>${escapeHtml(uomUnits.find((unit) => unit.id === goal.uomUnit)?.label || "Numeric")}<p class="mini">${escapeHtml(uomTypes.find((type) => type.id === goal.uomType)?.label || "")}</p></td>
              <td>${escapeHtml(goal.target)}</td>
              <td>
                ${goal.recipientIds.map(userName).map(escapeHtml).join(", ")}
                ${goal.skippedRecipientIds?.length ? `<p class="mini">${goal.skippedRecipientIds.length} locked sheet(s) skipped for manager push.</p>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReports() {
  return `
    ${renderTitle("Reports", "Export planned versus actual achievement for all employees.", `
      <button class="button" data-action="export-csv">Export CSV</button>
    `)}
    <section class="panel">
      ${renderAchievementReport()}
    </section>
  `;
}

function renderAchievementReport() {
  const rows = achievementRows();
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Goal</th><th>Quarter</th><th>Target</th><th>Actual</th><th>Status</th><th>Score</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.employee)}</td>
              <td>${escapeHtml(row.goal)}</td>
              <td>${row.quarter}</td>
              <td>${escapeHtml(row.target)}</td>
              <td>${escapeHtml(row.actual)}</td>
              <td>${statusBadge(row.status)}</td>
              <td>${row.score}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAudit() {
  return `
    ${renderTitle("Audit trail", "System log for approvals, unlocks, edits, shared goals, and check-ins.")}
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            ${state.auditLogs.map((log) => `
              <tr>
                <td>${new Date(log.createdAt).toLocaleString()}</td>
                <td>${escapeHtml(userName(log.actorId))}</td>
                <td>${escapeHtml(log.entity)}</td>
                <td>${statusBadge(log.action)}</td>
                <td>${escapeHtml(log.detail)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCompletionTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Manager</th><th>Goal sheet</th><th>${activeQuarter} update</th><th>Manager check-in</th><th>Exception</th></tr></thead>
        <tbody>
          ${employeeUsers().map((employee) => {
            const sheet = sheetForEmployee(employee.id);
            const goals = sheet ? goalsForSheet(sheet.id) : [];
            const hasUpdate = goals.some((goal) => updateForGoal(goal.id));
            const checkIn = state.checkIns.find((item) => item.employeeId === employee.id && item.quarter === activeQuarter);
            return `
              <tr>
                <td><strong>${escapeHtml(employee.name)}</strong><p class="mini">${escapeHtml(employee.department)}</p></td>
                <td>${escapeHtml(userName(employee.managerId))}</td>
                <td>${statusBadge(sheet?.status || "NOT STARTED")}</td>
                <td>${hasUpdate ? statusBadge("Completed") : statusBadge("Not Started")}</td>
                <td>${checkIn ? statusBadge("Completed") : statusBadge("Not Started")}</td>
                <td><button class="button small secondary" data-action="unlock-sheet" data-employee-id="${employee.id}" ${!sheet?.locked ? "disabled" : ""}>Unlock</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function metric(label, value, helper, tone) {
  return `<section class="panel metric ${tone}"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="mini">${escapeHtml(helper)}</span></section>`;
}

function renderQuarterSelect() {
  return `
    <select class="select" data-action="switch-quarter" aria-label="Select quarter">
      ${quarters.map((quarter) => `<option value="${quarter.id}" ${quarter.id === activeQuarter ? "selected" : ""}>${quarter.label}</option>`).join("")}
    </select>
  `;
}

function updateSharedFormulaOptions(unit) {
  const select = root.querySelector('[data-shared-field="uomType"]');
  if (!select) return;
  select.replaceChildren(
    ...formulaOptionsForUnit(unit).map((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.label;
      return option;
    })
  );
}

function renderSchedule() {
  return `
    <div class="timeline">
      <div class="timeline-item"><strong>1 May</strong><div><strong>Phase 1 - Goal Setting</strong><p class="mini">Goal creation, submission, and approval.</p></div></div>
      ${quarters.map((quarter) => `<div class="timeline-item"><strong>${quarter.window}</strong><div><strong>${quarter.label}</strong><p class="mini">${quarter.action}</p></div></div>`).join("")}
    </div>
  `;
}

function achievementRows() {
  return state.goals.flatMap((goal) => {
    const sheet = state.goalSheets.find((item) => item.id === goal.sheetId);
    const updates = state.goalUpdates.filter((update) => update.goalId === goal.id);
    if (!updates.length) {
      return [{ employee: userName(sheet?.employeeId), goal: goal.title, quarter: activeQuarter, target: goal.target, actual: "", status: "Not Started", score: "Pending" }];
    }
    return updates.map((update) => ({
      employee: userName(sheet?.employeeId),
      goal: goal.title,
      quarter: update.quarter,
      target: goal.target,
      actual: update.actual || update.completionDate || "",
      status: update.status,
      score: formatScore(calculateProgress(goal, update)),
    }));
  });
}

function upsertGoalUpdate(goalId, field, value) {
  let update = updateForGoal(goalId);
  if (!update) {
    update = {
      id: uid("update"),
      goalId,
      quarter: activeQuarter,
      actual: "",
      completionDate: "",
      status: "On Track",
      updatedBy: currentUserId,
      updatedAt: new Date().toISOString(),
    };
    state.goalUpdates.push(update);
  }
  update[field] = value;
  update.updatedBy = currentUserId;
  update.updatedAt = new Date().toISOString();

  const goal = state.goals.find((item) => item.id === goalId);
  const sheet = state.goalSheets.find((item) => item.id === goal?.sheetId);
  const sharedGoal = state.sharedGoals.find((item) => item.id === goal?.sharedGoalId);
  if (sharedGoal && sheet?.employeeId === sharedGoal.primaryOwnerId) {
    state.goals
      .filter((item) => item.sharedGoalId === sharedGoal.id && item.id !== goalId)
      .forEach((linkedGoal) => {
        let linkedUpdate = updateForGoal(linkedGoal.id);
        if (!linkedUpdate) {
          linkedUpdate = {
            id: uid("update"),
            goalId: linkedGoal.id,
            quarter: activeQuarter,
            actual: "",
            completionDate: "",
            status: "On Track",
            updatedBy: currentUserId,
            updatedAt: new Date().toISOString(),
          };
          state.goalUpdates.push(linkedUpdate);
        }
        linkedUpdate[field] = value;
        linkedUpdate.updatedBy = currentUserId;
        linkedUpdate.updatedAt = new Date().toISOString();
      });
  }
}

function persistFieldChange(target) {
  if (target.dataset.goalId && target.dataset.goalField) {
    const goal = state.goals.find((item) => item.id === target.dataset.goalId);
    if (!goal) return true;
    const field = target.dataset.goalField;
    const sheet = state.goalSheets.find((item) => item.id === goal.sheetId);
    const user = currentUser();

    if (sheet?.locked) return true;
    if (goal.sharedGoalId && field !== "weightage") return true;
    if (user.role === "manager" && currentSection === "approvals" && !["target", "weightage"].includes(field)) return true;
    if (user.role === "manager" && currentSection === "approvals" && sheet?.managerId !== user.id) return true;
    if (user.role === "employee" && !isEmployeeEditableSheet(sheet)) return true;
    if (user.role === "employee" && sheet?.employeeId !== user.id) return true;

    goal[field] = field === "weightage" ? Number(target.value) : target.value;
    if (field === "uomUnit") {
      goal.uomUnit = target.value;
      goal.uomType = formulaOptionsForUnit(target.value)[0].id;
    }
    normalizeGoalMeasurement(goal);
    goal.status = goal.status || "Not Started";
    saveState(state);
    return true;
  }

  if (target.dataset.updateGoalId && target.dataset.updateField) {
    upsertGoalUpdate(target.dataset.updateGoalId, target.dataset.updateField, target.value);
    if (state.meta.updateValidationAttempt === updateValidationKey()) {
      state.meta.updateValidationAttempt = "";
    }
    saveState(state);
    return true;
  }

  if (target.dataset.managerNote) {
    const sheet = state.goalSheets.find((item) => item.id === target.dataset.managerNote);
    if (sheet) {
      sheet.managerNote = target.value;
      saveState(state);
    }
    return true;
  }

  return false;
}

root.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.action === "switch-user") {
    currentUserId = target.value;
    currentSection = "overview";
    localStorage.setItem("atomquest-current-user", currentUserId);
    localStorage.setItem("atomquest-current-section", currentSection);
    render();
    return;
  }

  if (target.dataset.action === "switch-quarter") {
    activeQuarter = target.value;
    localStorage.setItem("atomquest-active-quarter", activeQuarter);
    render();
  }

  persistFieldChange(target);
  if (target.dataset.goalField === "uomUnit") render();
  if (target.dataset.sharedField === "uomUnit") updateSharedFormulaOptions(target.value);
});

root.addEventListener("input", (event) => {
  const target = event.target;

  persistFieldChange(target);

  if (target.dataset.checkinEmployee) {
    saveState(state);
  }
});

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  if (!action) return;

  if (action === "section") {
    currentSection = button.dataset.section;
    localStorage.setItem("atomquest-current-section", currentSection);
    render();
  }

  if (action === "reset-demo") {
    currentUserId = "emp-asha";
    currentSection = "overview";
    activeQuarter = "Q1";
    localStorage.setItem("atomquest-current-user", currentUserId);
    localStorage.setItem("atomquest-current-section", currentSection);
    localStorage.setItem("atomquest-active-quarter", activeQuarter);
    setState(resetState());
  }

  if (action === "add-goal") {
    const sheet = ensureSheet(currentUserId);
    if (!isEmployeeEditableSheet(sheet) || goalsForSheet(sheet.id).length >= 8) return;
    state.goals.push({
      id: uid("goal"),
      sheetId: sheet.id,
      thrustArea: thrustAreas[0],
      title: "",
      description: "",
      uomUnit: "NUMERIC",
      uomType: "MIN",
      target: "",
      weightage: 10,
      status: "Not Started",
      sharedGoalId: null,
      readOnlyFields: [],
    });
    sheet.status = "DRAFT";
    sheet.updatedAt = new Date().toISOString();
    audit(currentUserId, "Goal", sheet.id, "ADDED", "Employee added a goal draft.");
    setState();
  }

  if (action === "delete-goal") {
    const goal = state.goals.find((item) => item.id === button.dataset.goalId);
    const sheet = state.goalSheets.find((item) => item.id === goal?.sheetId);
    if (!goal || goal.sharedGoalId || !isEmployeeEditableSheet(sheet)) return;
    state.goals = state.goals.filter((item) => item.id !== button.dataset.goalId);
    audit(currentUserId, "Goal", button.dataset.goalId, "DELETED", "Employee removed a draft goal.");
    setState();
  }

  if (action === "submit-goals") {
    const sheet = ensureSheet(currentUserId);
    if (!isEmployeeEditableSheet(sheet)) return;
    const goals = goalsForSheet(sheet.id);
    const errors = validateGoals(goals);
    if (errors.length) {
      render();
      return;
    }
    sheet.status = "SUBMITTED";
    sheet.locked = false;
    sheet.managerNote = "";
    sheet.updatedAt = new Date().toISOString();
    state.notifications.push({ id: uid("note"), userId: sheet.managerId, message: `${userName(currentUserId)} submitted goals for approval.`, type: "Approval", createdAt: new Date().toISOString(), read: false });
    audit(currentUserId, "GoalSheet", sheet.id, "SUBMITTED", "Goal sheet submitted to manager.");
    setState();
  }

  if (action === "approve-sheet") {
    const sheet = state.goalSheets.find((item) => item.id === button.dataset.sheetId);
    sheet.status = "APPROVED";
    sheet.locked = true;
    sheet.updatedAt = new Date().toISOString();
    audit(currentUserId, "GoalSheet", sheet.id, "APPROVED", "Manager approved and locked the goal sheet.");
    setState();
  }

  if (action === "return-sheet") {
    const sheet = state.goalSheets.find((item) => item.id === button.dataset.sheetId);
    sheet.status = "RETURNED";
    sheet.locked = false;
    sheet.updatedAt = new Date().toISOString();
    audit(currentUserId, "GoalSheet", sheet.id, "RETURNED", sheet.managerNote || "Manager returned the sheet for rework.");
    setState();
  }

  if (action === "save-updates") {
    const sheet = sheetForEmployee(currentUserId);
    const goals = sheet ? goalsForSheet(sheet.id) : [];
    const errors = goals.flatMap((goal) => validateGoalUpdate(goal, updateForGoal(goal.id), true));
    if (errors.length) {
      state.meta.updateValidationAttempt = updateValidationKey();
      saveState(state);
      render();
      return;
    }
    state.meta.updateValidationAttempt = "";
    audit(currentUserId, "GoalUpdate", activeQuarter, "SAVED", `${activeQuarter} achievement updates saved.`);
    setState();
  }

  if (action === "save-checkin") {
    const fields = {};
    root.querySelectorAll(`[data-checkin-employee="${button.dataset.employeeId}"][data-checkin-field]`).forEach((textarea) => {
      fields[textarea.dataset.checkinField] = textarea.value;
    });
    const existing = state.checkIns.find((item) => item.employeeId === button.dataset.employeeId && item.quarter === activeQuarter);
    const comment = [fields.summary, fields.blockers, fields.nextActions].filter(Boolean).join("\n");
    if (existing) {
      existing.summary = fields.summary || "";
      existing.blockers = fields.blockers || "";
      existing.nextActions = fields.nextActions || "";
      existing.comment = comment;
      existing.createdAt = new Date().toISOString();
    } else {
      state.checkIns.push({
        id: uid("checkin"),
        employeeId: button.dataset.employeeId,
        managerId: currentUserId,
        quarter: activeQuarter,
        cycleId: state.meta.activeCycleId,
        summary: fields.summary || "",
        blockers: fields.blockers || "",
        nextActions: fields.nextActions || "",
        comment,
        createdAt: new Date().toISOString(),
      });
    }
    audit(currentUserId, "CheckIn", button.dataset.employeeId, "SAVED", `${activeQuarter} manager check-in saved.`);
    setState();
  }

  if (action === "save-cycle") {
    root.querySelectorAll("[data-cycle-field]").forEach((input) => {
      state.cycles[0][input.dataset.cycleField] = input.value;
    });
    audit(currentUserId, "Cycle", state.cycles[0].id, "UPDATED", "Admin updated cycle configuration.");
    setState();
  }

  if (action === "push-shared-goal") {
    const values = {};
    root.querySelectorAll("[data-shared-field]").forEach((input) => {
      values[input.dataset.sharedField] = input.value;
    });
    if (!values.title || !values.target) return;
    const actor = currentUser();
    const recipients = sharedGoalRecipientsFor(actor);
    if (!recipients.length || !["admin", "manager"].includes(actor.role)) return;

    const allowedFormulaIds = formulaOptionsForUnit(values.uomUnit).map((type) => type.id);
    if (!allowedFormulaIds.includes(values.uomType)) {
      values.uomType = allowedFormulaIds[0];
    }
    if (!recipients.some((employee) => employee.id === values.primaryOwnerId)) {
      values.primaryOwnerId = recipients[0].id;
    }
    const sharedWeightage = Math.min(100, Math.max(10, Number(values.weightage || 10)));

    const sharedGoal = {
      id: uid("shared"),
      title: values.title,
      description: values.description,
      thrustArea: values.thrustArea,
      uomUnit: values.uomUnit,
      uomType: values.uomType,
      target: values.target,
      primaryOwnerId: values.primaryOwnerId,
      recipientIds: recipients.map((employee) => employee.id),
      skippedRecipientIds: [],
      createdBy: currentUserId,
      createdAt: new Date().toISOString(),
    };
    state.sharedGoals.push(sharedGoal);
    recipients.forEach((employee) => {
      const sheet = ensureSheet(employee.id);
      if (sheet.locked && actor.role !== "admin") {
        sharedGoal.skippedRecipientIds.push(employee.id);
        return;
      }
      if (sheet.locked && actor.role === "admin") {
        sheet.locked = false;
        sheet.status = "RETURNED";
        sheet.managerNote = "Unlocked by Admin to add a shared departmental KPI. Adjust shared KPI weightage and resubmit.";
        audit(currentUserId, "GoalSheet", sheet.id, "UNLOCKED", "Admin unlocked the sheet while pushing a shared KPI.");
      }
      if (sheet.status === "SUBMITTED") {
        sheet.status = "RETURNED";
        sheet.managerNote = "Shared departmental KPI added. Adjust shared KPI weightage and resubmit.";
      }
      state.goals.push({
        id: uid("goal"),
        sheetId: sheet.id,
        thrustArea: sharedGoal.thrustArea,
        title: sharedGoal.title,
        description: sharedGoal.description,
        uomUnit: sharedGoal.uomUnit,
        uomType: sharedGoal.uomType,
        target: sharedGoal.target,
        weightage: sharedWeightage,
        status: "Not Started",
        sharedGoalId: sharedGoal.id,
        readOnlyFields: sharedGoalReadOnlyFields,
      });
    });
    audit(
      currentUserId,
      "SharedGoal",
      sharedGoal.id,
      "PUSHED",
      `${actor.role === "manager" ? "Manager" : "Admin"} pushed a shared departmental KPI to ${sharedGoal.recipientIds.length - sharedGoal.skippedRecipientIds.length} employee(s).`
    );
    setState();
  }

  if (action === "unlock-sheet") {
    const sheet = sheetForEmployee(button.dataset.employeeId);
    if (sheet) {
      sheet.locked = false;
      sheet.status = "RETURNED";
      sheet.managerNote = "Unlocked by Admin for exception handling.";
      audit(currentUserId, "GoalSheet", sheet.id, "UNLOCKED", "Admin unlocked an approved sheet for exception handling.");
      setState();
    }
  }

  if (action === "export-csv") {
    exportCsv();
  }
});

function exportCsv() {
  const rows = achievementRows();
  const header = ["Employee", "Goal", "Quarter", "Target", "Actual", "Status", "Score"];
  const csv = [header, ...rows.map((row) => [row.employee, row.goal, row.quarter, row.target, row.actual, row.status, row.score])]
    .map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "atomquest-achievement-report.csv";
  link.click();
  URL.revokeObjectURL(url);
  audit(currentUserId, "Report", "achievement", "EXPORTED", "Admin exported achievement report CSV.");
  saveState(state);
}

render();
