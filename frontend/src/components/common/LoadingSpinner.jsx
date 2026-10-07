import React from "react";

const LoadingSpinner = () => {
  return (
    <div style={{ 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      height: "100vh", 
      background: "#f5f7fb" 
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ 
          width: "40px", 
          height: "40px", 
          border: "4px solid #e5e7eb",
          borderTop: "4px solid #2563eb",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto 10px"
        }}></div>
        <p style={{ fontSize: "14px", color: "#6b7280" }}>Loading...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
};

export default LoadingSpinner;