import RecommendedForYou from "../components/RecommendedForYou";
import React from "react";

export default function Dashboard() {
  return (
    <div style={{ background: "#f5f7fb", minHeight: "100vh", padding: "20px", fontFamily: "Arial" }}>
      <div style={{ maxWidth: "1250px", margin: "0 auto" }}>
        
        {/* HEADER */}
        <div style={{ background: "#0a1e4a", color: "white", padding: "20px 30px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "32px" }}>Good Morning, Deepak</h1>
            <p style={{ fontSize: "14px", color: "#a0b0d0" }}>Keep going! You're closer to your goals than you think</p>
          </div>
          <div style={{ fontSize: "70px" }}>🤖</div>
        </div>

        {/* 5 STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "15px", marginTop: "-20px", padding: "0 10px" }}>
          {[
            { l: "Active Courses", v: "3", c: "#2563eb", icon: "📖" },
            { l: "Learning Goal", v: "68%", c: "#14b8a6", icon: "🎯" },
            { l: "Streak", v: "7 Days", c: "#f97316", icon: "🔥" },
            { l: "Certificates", v: "4", c: "#7c3aed", icon: "🏅" },
            { l: "Total XP", v: "1,240", c: "#eab308", icon: "⚡" },
          ].map((s,i)=>(
            <div key={i} style={{ background: "white", borderRadius: "12px", padding: "20px", textAlign: "center", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}>
              <div style={{ width: "50px", height: "50px", background: s.c, borderRadius: "50%", margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", color: "white" }}>{s.icon}</div>
              <div style={{ fontSize: "12px", color: "gray" }}>{s.l}</div>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "#0a1e4a" }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "20px", marginTop: "20px" }}>
          <div>
            {/* Continue + AI */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ background: "white", borderRadius: "12px", padding: "20px" }}>
                <b>📖 Continue Learning - 72% completed</b>
              </div>
              <div style={{ background: "#e0e7ff", borderRadius: "12px", padding: "20px" }}>
                <b>✨ AI Mentor</b><br/>
                <button style={{ background: "#5b4bff", color: "white", border: "none", padding: "8px 16px", borderRadius: "20px", marginTop: "10px" }}>💬 Chat with Mentor</button>
              </div>
            </div>

            {/* >>> HERE YOU ADD THE COMPONENT <<< */}
            <div style={{ marginTop: "20px" }}>
              <RecommendedForYou />
            </div>

          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px" }}>
            <b>Deepak - BTech CSE</b>
            <div style={{ marginTop: "15px", fontSize: "12px" }}>Quick Stats<br/>Hours Learned - 24.5h</div>
          </div>
        </div>
      </div>
    </div>
  );
}