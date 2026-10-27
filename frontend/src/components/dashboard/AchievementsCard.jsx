import { Award, Flame, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

const AchievementsCard = ({
  myCourses = [],
  streak = 0,
  certificateCount = 0,
  certificateCourseTitle = "",
  t,
}) => {
  const completedCourse = myCourses.find((course) => Number(course.progress) >= 100);

  const streakMilestones = [3, 7, 14, 30];
  const achievedStreak = streakMilestones.filter((days) => streak >= days).at(-1);

  const achievements = [];

  if (completedCourse) {
    achievements.push({
      id: "course",
      title: t("analytics.achievements.course_title", {
        title: completedCourse.title,
      }),
      description: t("analytics.achievements.course_description"),
      Icon: Award,
    });
  }

  if (achievedStreak) {
    achievements.push({
      id: "streak",
      title: t("analytics.achievements.streak_title", {
        count: achievedStreak,
      }),
      description: t("analytics.achievements.streak_description"),
      Icon: Flame,
    });
  }

  if (certificateCount > 0 && certificateCourseTitle) {
    achievements.push({
      id: "certificate",
      title: t("analytics.achievements.certificate_title"),
      description: certificateCourseTitle,
      Icon: Award,
    });
  }

  return (
    <section
      aria-labelledby="achievements-card-title"
      className="min-w-0 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id="achievements-card-title"
          className="flex min-w-0 items-center gap-2 text-lg font-extrabold text-main"
        >
          <Trophy aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-500" />
          <span>{t("analytics.achievements.title")}</span>
        </h2>

        <Link
          to="/certificates"
          className="shrink-0 text-sm font-bold text-[#3867D6] hover:underline"
        >
          {t("analytics.achievements.view_all")}
        </Link>
      </div>

      {achievements.length > 0 ? (
        <ul className="space-y-3">
          {achievements.slice(0, 3).map((achievement) => {
            const AchievementIcon = achievement.Icon;

            return (
              <li
                key={achievement.id}
                className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-canvas-alt p-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <AchievementIcon aria-hidden="true" className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 title={achievement.title} className="truncate font-bold text-main">
                    {achievement.title}
                  </h3>
                  <p title={achievement.description} className="break-words text-sm text-muted">
                    {achievement.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {t("analytics.achievements.empty")}
        </p>
      )}
    </section>
  );
};

export default AchievementsCard;
