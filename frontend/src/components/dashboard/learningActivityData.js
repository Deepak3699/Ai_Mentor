// Mock data until a weekly-activity endpoint exists (hours learned per day).
export const WEEKLY_ACTIVITY = [
  { day: "Mon", hours: 3.5 },
  { day: "Tue", hours: 4.3 },
  { day: "Wed", hours: 3 },
  { day: "Thu", hours: 4.6 },
  { day: "Fri", hours: 3.4 },
  { day: "Sat", hours: 5.6 },
  { day: "Sun", hours: 6.4 },
];

// Summary values from the design reference (kept separate from the chart mock).
export const WEEKLY_SUMMARY = {
  hours: 8.5,
  changePercent: 24,
};
