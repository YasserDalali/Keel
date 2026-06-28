import { createContext, useContext, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import type { components } from "./lib/api-types";
import Nav from "./components/Nav";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import KycPage from "./pages/KycPage";
import DashboardPage from "./pages/DashboardPage";
import OfficerPage from "./pages/OfficerPage";

type Me = components["schemas"]["Me"];

interface AuthCtx {
  user: Me | null;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthContext");
  return ctx;
}

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    const { data } = await api.GET("/auth/me");
    setUser(data ?? null);
  }

  useEffect(() => {
    if (localStorage.getItem("token")) {
      fetchMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(token: string) {
    localStorage.setItem("token", token);
    await fetchMe();
  }

  async function logout() {
    await api.POST("/auth/logout");
    localStorage.removeItem("token");
    setUser(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <KycPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/officer"
            element={
              <ProtectedRoute roles={["officer", "admin"]}>
                <OfficerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <Navigate to={user ? "/dashboard" : "/login"} replace />
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
