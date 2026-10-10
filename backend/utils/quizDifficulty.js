export const getQuizDifficulty = (quizHistory = []) => {
  if (!quizHistory.length) return "intermediate";

  const recentAttempt = quizHistory[quizHistory.length - 1];
  const score = Number(recentAttempt.score);

  if (!Number.isFinite(score)) return "intermediate";

  if (score < 50) return "beginner";
  if (score <= 80) return "intermediate";
  return "advanced";
};

export const getWeakTopics = (quizHistory = []) => {
  return [
    ...new Set(
      quizHistory
        .slice(-3)
        .flatMap((attempt) => Array.isArray(attempt.weakTopics) ? attempt.weakTopics : [])
        .filter(Boolean)
    ),
  ].slice(0, 10);
};
