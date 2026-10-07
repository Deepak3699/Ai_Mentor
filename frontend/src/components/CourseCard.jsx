import React from "react";

const CourseCard = ({ course, isPopular }) => {
  return (
    <div
      className="bg-white rounded-xl p-5 border hover:shadow-lg transition-all"
      style={{ background: "white", borderRadius: "12px", padding: "16px", border: "1px solid #e5e7eb", position: "relative", textAlign: "left" }}
    >
      {isPopular && (
        <span
          className="bg-yellow-100 text-yellow-700"
          style={{ position: "absolute", top: "8px", left: "8px", background: "#fef3c7", color: "#d97706", fontSize: "10px", fontWeight: "bold", padding: "3px 8px", borderRadius: "20px" }}
        >
          ⭐ Popular
        </span>
      )}

      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
        style={{ width: "48px", height: "48px", borderRadius: "12px", background: course.bg, display: "flex", alignItems: "center", justifyContent: "center", marginTop: isPopular? "12px" : "0", marginBottom: "12px" }}
      >
        <img src={course.icon} alt={course.title} style={{ width: "28px", height: "28px", objectFit: "contain" }} />
      </div>

      <h3 className="font-bold text-gray-900" style={{ fontWeight: "bold", fontSize: "14px", color: "#111827", margin: "0 0 4px 0" }}>{course.title}</h3>
      <p className="text-gray-500" style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 8px 0" }}>{course.category}</p>

      <div className="text-gray-500" style={{ fontSize: "11px", color: "#6b7280", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
        <span>🕒 {course.duration}</span>
        <span>•</span>
        <span>{course.level}</span>
      </div>

      <button
        className="text-blue-600 font-semibold"
        style={{ color: "#2563eb", fontSize: "12px", fontWeight: "600", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Enroll Now →
      </button>
    </div>
  );
};

export default CourseCard;