import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from "react-router";
import "./styles/tokens.css";
import { AppIndex, AppShell, RequireStaff } from "./app/AppShell";
import AuthPage from "./auth/AuthPage";
import { AuthProvider, RedirectIfSignedIn, RequireAuth } from "./lib/auth";
import { useSmoothScroll } from "./lib/motion";
import SystemPage from "./system/SystemPage";
import LandingPage from "./marketing/LandingPage";
import { Scrollbar } from "./ui/Scrollbar";

const Dashboard = lazy(() => import("./app/Dashboard"));
const Apply = lazy(() => import("./app/Apply"));
const LoanDetail = lazy(() => import("./app/LoanDetail"));
const Setup = lazy(() => import("./app/Setup"));
const Queue = lazy(() => import("./app/Queue"));

function Root() {
  useSmoothScroll();
  return (
    <AuthProvider>
      <Outlet />
      <ScrollRestoration />
      <Scrollbar />
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/signin", element: <RedirectIfSignedIn><AuthPage key="signin" mode="signin" /></RedirectIfSignedIn> },
      { path: "/signup", element: <RedirectIfSignedIn><AuthPage key="signup" mode="signup" /></RedirectIfSignedIn> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/app",
            element: <AppShell />,
            children: [
              { index: true, element: <AppIndex /> },
              { path: "loans", element: <Dashboard /> },
              { path: "loans/:id", element: <LoanDetail /> },
              { path: "apply", element: <Apply /> },
              { path: "setup", element: <Setup /> },
              { path: "queue", element: <RequireStaff><Queue /></RequireStaff> },
            ],
          },
        ],
      },
      { path: "/system", element: <SystemPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
