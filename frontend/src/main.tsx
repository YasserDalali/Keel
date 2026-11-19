import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from "react-router";
import "./styles/tokens.css";
import { AppIndex, AppShell, RequireStaff } from "./app/AppShell";
import AuthPage from "./auth/AuthPage";
import { AuthProvider, RedirectIfSignedIn, RequireAuth } from "./lib/auth";
import { useSmoothScroll } from "./lib/motion";
import { ToastProvider } from "./ui/Toast";
import { registerServiceWorker } from "./lib/pwa";
import SystemPage from "./system/SystemPage";
import LandingPage from "./marketing/LandingPage";
import { Scrollbar } from "./ui/Scrollbar";

const Dashboard = lazy(() => import("./app/Dashboard"));
const Apply = lazy(() => import("./app/Apply"));
const LoanDetail = lazy(() => import("./app/LoanDetail"));
const Setup = lazy(() => import("./app/Setup"));
const Queue = lazy(() => import("./app/Queue"));
const Profile = lazy(() => import("./app/Profile"));
const Statements = lazy(() => import("./app/Statements"));
const Checkout = lazy(() => import("./app/Checkout"));
const VerifyEmail = lazy(() => import("./auth/VerifyEmail"));
const Schedule = lazy(() => import("./app/Schedule"));
const History = lazy(() => import("./app/History"));

function Root() {
  useSmoothScroll();
  return (
    <AuthProvider>
      <ToastProvider>
        <Outlet />
        <ScrollRestoration />
        <Scrollbar />
      </ToastProvider>
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
          { path: "/app/pay/:loanId", element: <Suspense fallback={null}><Checkout /></Suspense> },
          {
            path: "/app",
            element: <AppShell />,
            children: [
              { index: true, element: <AppIndex /> },
              { path: "loans", element: <Dashboard /> },
              { path: "loans/:id", element: <LoanDetail /> },
              { path: "apply", element: <Apply /> },
              { path: "setup", element: <Setup /> },
              { path: "profile", element: <Profile /> },
              { path: "schedule", element: <Schedule /> },
              { path: "history", element: <History /> },
              { path: "statements", element: <Statements /> },
              { path: "queue", element: <RequireStaff><Queue /></RequireStaff> },
            ],
          },
        ],
      },
      { path: "/verify-email", element: <Suspense fallback={null}><VerifyEmail /></Suspense> },
      { path: "/system", element: <SystemPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
