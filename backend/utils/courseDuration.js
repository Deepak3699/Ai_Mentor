// Lesson durations are stored as text (for example "12 min" or "1:30").
export function courseDuration(modules = []) {
  const lessons = modules.flatMap((module) => module.lessons || []);
  if (!lessons.length) return null;
  let seconds = 0;
  for (const lesson of lessons) {
    const value = String(lesson.duration || "")
      .trim()
      .toLowerCase();
    if (/^\d+:\d{2}(:\d{2})?$/.test(value)) {
      seconds += value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    } else {
      const pattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/g;
      const parts = [...value.matchAll(pattern)];
      if (!parts.length || value.replace(pattern, "").trim()) return null;
      for (const [, amount, unit] of parts) {
        seconds += Number(amount) * (unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1);
      }
    }
  }
  if (seconds <= 0) return null;
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}
