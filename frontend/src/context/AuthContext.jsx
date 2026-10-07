// frontend/src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase.js"; 
import { apiFetch, SESSION_EXPIRED_EVENT } from "../lib/api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const hasFetchedProfile = useRef(false);

  useEffect(() => {
    const expireSession = () => {
      setIsAuthenticated(false);
      setUser(null);
      hasFetchedProfile.current = false;
      if (auth) signOut(auth).catch(console.error);
      toast.error("Session expired. Please log in again.", { id: "session-expired" });
      navigate("/login", { replace: true });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [navigate]);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    return !!(token && storedUser && storedUser !== "undefined");
  });

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    try {
      return storedUser && storedUser !== "undefined"
        ? JSON.parse(storedUser)
        : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser || storedUser === "undefined") {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  const login = (userData) => {
    hasFetchedProfile.current = false;
    setIsAuthenticated(true);

    const newUser = {
      ...userData,
      token: userData.token || localStorage.getItem("token"),
      avatar_url: userData.avatar_url || null,
      isProfileComplete: userData.isProfileComplete ?? false,
      isGoogleUser: (userData.isGoogleUser || !!userData.googleId) ?? false,
      googleId: userData.googleId ?? null,
      hasPassword: userData.hasPassword ?? false,
    };

    setUser(newUser);
    localStorage.setItem("token", newUser.token);
    localStorage.setItem("user", JSON.stringify(newUser));
    localStorage.removeItem("preferencesSkipped");
  };

  const fetchUserProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await apiFetch("/api/users/profile");
      if (!response || !response.ok) return;

      const userData = await response.json();
      if (localStorage.getItem("token") !== token) return;

      const newUser = {
        ...userData,
        token: localStorage.getItem("token"),
        avatar_url: userData.avatar_url || null,
        isProfileComplete: userData.isProfileComplete ?? false,
        isGoogleUser: userData.isGoogleUser ?? false,
        googleId: userData.googleId ?? null,
        hasPassword: userData.hasPassword ?? false,
      };

      setUser(prev => {
        if (JSON.stringify(prev) === JSON.stringify(newUser)) return prev;
        localStorage.setItem("user", JSON.stringify(newUser));
        return newUser;
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !hasFetchedProfile.current) {
      hasFetchedProfile.current = true;
      fetchUserProfile();
    }
  }, [isAuthenticated, fetchUserProfile]);

  const logout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error("Firebase sign out error:", error);
    }

    hasFetchedProfile.current = false;
    setIsAuthenticated(false);
    setUser(null);

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("course-progress-")) {
        localStorage.removeItem(key);
      }
    });

    localStorage.clear();
  };

  const updateUser = (updatedUserData) => {
    setUser((prevUser) => {
      const newUser = {
        ...prevUser,
        ...updatedUserData,
        settings: {
          ...prevUser?.settings,
          ...updatedUserData?.settings,
        },
        token: prevUser?.token || localStorage.getItem("token"),
      };

      localStorage.setItem("user", JSON.stringify(newUser));
      return newUser;
    });
  };

  const value = {
    isAuthenticated,
    user,
    login,
    logout,
    updateUser,
    fetchUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};