/**
 * Distributes rounded percentages so they sum to exactly 100
 * using the largest-remainder (Hare-Niemeyer) method.
 *
 * @param {Object} counts - Map of category keys to counts (e.g. { completed: 2, inProgress: 1, notStarted: 1 })
 * @returns {Object} Map of category keys to integer percentages summing to 100 (or all 0 if total is 0)
 */
export function calculatePercentages(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return { completed: 0, inProgress: 0, notStarted: 0 };
  }

  const entries = [
    { key: "completed", count: counts.completed || 0, index: 0 },
    { key: "inProgress", count: counts.inProgress || 0, index: 1 },
    { key: "notStarted", count: counts.notStarted || 0, index: 2 },
  ].map((item) => {
    const exact = (item.count / total) * 100;
    const floor = Math.floor(exact);
    // Round remainder to 8 decimal places to eliminate floating point precision noise
    const remainder = Math.round((exact - floor) * 1e8) / 1e8;
    return { ...item, exact, floor, remainder };
  });

  const sumFloors = entries.reduce((sum, item) => sum + item.floor, 0);
  const diff = 100 - sumFloors;

  // Sort by remainder descending, preserve original order on ties
  const sorted = [...entries].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < diff; i++) {
    sorted[i % sorted.length].floor += 1;
  }

  return entries.reduce((acc, item) => {
    acc[item.key] = item.floor;
    return acc;
  }, {});
}
