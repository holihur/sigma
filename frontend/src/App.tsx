import React, { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/store/auth";
import { bootTheme, useTheme } from "@/store/theme";
import { bootI18n } from "@/i18n";
import LoginPage from "@/pages/Login";

const DashboardPage = lazy(() => import("@/pages/Dashboard"));
const EditorPage = lazy(() => import("@/pages/Editor"));
const PublicPrototypePage = lazy(() => import("@/pages/PublicPrototype"));

function Splash() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-12 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white shadow-lg">
        <svg viewBox="0 0 32 32" className="size-6" fill="currentColor">
          <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
        </svg>
      </div>
      <span className="text-[13px] text-muted-foreground">Loading your workspace…</span>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const init = useAuth((s) => s.init);
  const loading = useAuth((s) => s.loading);
  const logout = useAuth((s) => s.logout);
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();

  useEffect(() => {
    bootTheme();
    bootI18n();
    void init();
  }, [init]);

  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      navigate("/login", { replace: true });
    };
    window.addEventListener("sigma:unauthorized", onUnauthorized);
    return () => window.removeEventListener("sigma:unauthorized", onUnauthorized);
  }, [logout, navigate]);

  return (
    <>
      {loading ? (
        <Splash />
      ) : (
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/p/:token" element={<PublicPrototypePage />} />
            <Route
              path="/"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/file/:id"
              element={
                <Protected>
                  <EditorPage />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      )}
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!bg-popover !text-popover-foreground !border-border !shadow-xl",
            description: "!text-muted-foreground",
            actionButton: "!bg-primary !text-primary-foreground",
            cancelButton: "!bg-secondary !text-secondary-foreground",
          },
        }}
        richColors={false}
        closeButton
      />
    </>
  );
}
