// frontend/src/components/common/ThemeToggle.jsx
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const ThemeToggle = () => {
  const { setTheme, isDark } = useTheme();

  const toggleTheme = () => {
    // Always switch explicitly between light & dark
    if (isDark) {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="p-1.5 sm:px-2 rounded-xl text-muted hover:bg-canvas-alt transition-colors font-semibold"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
};

export default ThemeToggle;