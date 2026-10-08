import React from "react";
import CourseCard from "./CourseCard";

const mockCourses = [
  { id: 1, title: "React Advanced", category: "Web Development", duration: "12h", level: "Intermediate", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg", bg: "#e0f2fe" },
  { id: 2, title: "Node.js Backend", category: "Backend Development", duration: "10h", level: "Intermediate", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg", bg: "#dcfce7" },
  { id: 3, title: "Python for Data Science", category: "Data Science", duration: "15h", level: "Beginner", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg", bg: "#fef9c3" },
  { id: 4, title: "System Design Basics", category: "Software Engineering", duration: "8h", level: "Advanced", icon: "https://cdn-icons-png.flaticon.com/512/2103/2103633.png", bg: "#ccfbf1" },
];

const RecommendedForYou = () => {
  return (
    <div className="bg-white rounded-2xl p-6 border shadow-sm" style={{ background: "white", borderRadius: "16px", padding: "20px", border: "1px solid #e5e7eb" }}>
      {/* Section Header - FIXED WITH INLINE COLOR */}
      <div className="flex justify-between items-start mb-6" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h2
            className="text-[18px] font-bold flex items-center gap-2 text-gray-900"
            style={{ fontSize: "18px", fontWeight: "bold", color: "#111827", margin: "0", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span>✨</span> Recommended For You
          </h2>
          <p className="text-[13px] text-gray-500 mt-1" style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>Based on your learning history and goals</p>
        </div>
        <a href="/courses" className="text-[13px] text-blue-600 font-medium hover:underline" style={{ fontSize: "13px", color: "#2563eb", fontWeight: "500", textDecoration: "none" }}>View All →</a>
      </div>

      {/* Render 4 courses using mock data and.map() */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        {mockCourses.map((course, index) => (
          <CourseCard
            key={course.id}
            course={course}
            isPopular={index === 0}
          />
        ))}
      </div>
    </div>
  );
};

export default RecommendedForYou;