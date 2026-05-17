export function calculateProgress(goal, update) {
  if (!goal || !update) return null;

  if (goal.uomType === "TIMELINE") {
    if (!update.completionDate || !goal.target) return null;
    const deadline = new Date(goal.target);
    const completed = new Date(update.completionDate);
    if (Number.isNaN(deadline.getTime()) || Number.isNaN(completed.getTime())) return null;
    if (completed <= deadline) return 100;
    const daysLate = Math.ceil((completed - deadline) / 86400000);
    return Math.max(0, 100 - daysLate * 5);
  }

  const target = Number(goal.target);
  const actual = Number(update.actual);
  if (!Number.isFinite(target) || !Number.isFinite(actual)) return null;

  if (goal.uomType === "ZERO") return actual === 0 ? 100 : 0;
  if (target <= 0 || actual < 0) return null;
  if (goal.uomType === "MIN") return Math.min(150, Math.round((actual / target) * 100));
  if (goal.uomType === "MAX") return actual === 0 ? 150 : Math.min(150, Math.round((target / actual) * 100));
  return null;
}

export function formatScore(score) {
  return score === null || score === undefined ? "Pending" : `${Math.round(score)}%`;
}

export function weightedScore(goals, updates, quarter) {
  const active = goals.filter((goal) => Number(goal.weightage) > 0);
  if (!active.length) return null;

  let total = 0;
  let weight = 0;
  active.forEach((goal) => {
    const update = updates.find((item) => item.goalId === goal.id && item.quarter === quarter);
    const score = calculateProgress(goal, update);
    if (score !== null) {
      total += score * Number(goal.weightage);
      weight += Number(goal.weightage);
    }
  });

  return weight ? Math.round(total / weight) : null;
}
