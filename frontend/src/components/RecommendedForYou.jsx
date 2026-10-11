import { recommendedCourses } from "../data/recommendedCourses";

const CourseCard = ({ course }) => {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 relative hover:shadow-md transition">
      {course.isPopular && (
        <span className="absolute top-3 right-3 text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">Popular</span>
      )}
      <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-lg mb-3 shadow-sm">
        {course.icon}
      </div>
      <h3 className="text-[14px] font-semibold text-gray-900 line-clamp-1">{course.title}</h3>
      <p className="text-[12px] text-gray-500 mt-0.5">{course.category}</p>
      <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500">
        <span>🕒 {course.duration}</span>
        <span>📊 {course.level}</span>
      </div>
      <a href="/courses" className="text-[12px] text-blue-600 font-medium mt-3 inline-block hover:text-blue-700">Enroll Now →</a>
    </div>
  );
};

const RecommendedForYou = () => {
  return (
    <div className="w-full bg-white rounded-xl p-5 mt-6 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h2 className="text-[16px] font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center">✨</span>
            Recommended For You
          </h2>
          <p className="text-xs text-gray-500 mt-1 ml-8">Based on your learning history and goals</p>
        </div>
        <a href="/courses" className="text-xs font-medium text-blue-600 hover:text-blue-700">View All →</a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {recommendedCourses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  );
};

export default RecommendedForYou;