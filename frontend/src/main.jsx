import "./env-validator.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider } from "./context/SidebarContext";
import { Toaster } from "react-hot-toast";
import "./index.css";
import "./i18n/index.js";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HelmetProvider>
      <Router>
        <ThemeProvider>
          <SidebarProvider>
            <AuthProvider>
              <App />
              <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
            </AuthProvider>
          </SidebarProvider>
        </ThemeProvider>
      </Router>
    </HelmetProvider>
  </StrictMode>,
);

const hideStartupLoader = () => {
  const loader = document.getElementById("app-startup-loader");
  const styles = document.getElementById("app-startup-loader-styles");
  if (!loader) return;

  loader.remove();
  styles?.remove();
};

const isInitialDashboardRoute = window.location.pathname === "/dashboard";

if (isInitialDashboardRoute) {
  window.addEventListener("app:initial-content-ready", hideStartupLoader, { once: true });
} else {
  window.addEventListener("app:initial-route-ready", hideStartupLoader, { once: true });
}

window.setTimeout(hideStartupLoader, 10000);
