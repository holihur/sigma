import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { authApi } from "@/lib/api";
import type { OIDCConfig } from "@/lib/types";
import { useT } from "@/i18n";
import { prefetchDashboard, whenIdle } from "@/lib/prefetch";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const ssoLogin = useAuth((s) => s.ssoLogin);
  const navigate = useNavigate();
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oidc, setOidc] = useState<OIDCConfig | null>(null);
  const handledCallback = useRef(false);

  useEffect(() => {
    authApi.oidcConfig().then(setOidc).catch(() => setOidc({ enabled: false, label: "" }));
  }, []);

  // Warm the workspace route after login paints, so the demo button feels immediate.
  useEffect(() => whenIdle(prefetchDashboard, 1200), []);

  useEffect(() => {
    if (handledCallback.current) return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("oidc_error");
    const code = params.get("oidc_code");
    if (!error && !code) return;
    handledCallback.current = true;
    window.history.replaceState({}, "", "/login");
    if (error) {
      toast.error(error);
      return;
    }
    if (code) {
      setBusy(true);
      ssoLogin(code)
        .then((returnTo) => {
          toast.success(t("Signed in"));
          navigate(returnTo, { replace: true });
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setBusy(false));
    }
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!email.includes("@")) {
      toast.error(t("Enter a valid email address"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("Password must be at least 6 characters"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name || email.split("@")[0], email, password);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    try {
      await login("demo@sigma.design", "demo1234");
      toast.success(t("Welcome to the demo workspace"));
      navigate("/", { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        <LanguageToggle />
      </div>
      <div className="relative hidden flex-1 overflow-hidden bg-[#07111f] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.38),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(56,189,248,0.18),transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,.12) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-lg">
              <svg viewBox="0 0 32 32" className="size-5" fill="currentColor">
                <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">Sigma</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-[42px] font-semibold leading-[1.08] tracking-tight">
              {t("Design at the speed of thought.")}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">
              {t("A collaborative canvas for high-fidelity interfaces. Prototype real flows, share a link, and iterate together in real time.")}
            </p>

            <div className="mt-10 flex items-end gap-4">
              <div className="w-40 rotate-[-3deg] rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-[#f97316]" />
                  <div className="h-1.5 w-14 rounded-full bg-white/20" />
                </div>
                <div className="h-20 rounded-lg bg-gradient-to-br from-[#38bdf8] to-[#0369a1]" />
                <div className="mt-2 h-1.5 w-20 rounded-full bg-white/25" />
                <div className="mt-1.5 h-1.5 w-12 rounded-full bg-white/10" />
              </div>
              <div className="w-48 translate-y-4 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-12 rounded-full bg-white/20" />
                  <div className="flex size-4 items-center justify-center rounded-full bg-[#0ea5e9] text-[7px] font-bold">D</div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <div className="h-10 rounded bg-white/10" />
                  <div className="h-10 rounded bg-white/15" />
                  <div className="col-span-1 h-10 rounded bg-[#0ea5e9]/40" />
                </div>
                <div className="mt-2 flex gap-1">
                  <div className="h-5 flex-1 rounded bg-white/10" />
                  <div className="h-5 w-12 rounded bg-[#0ea5e9]" />
                </div>
              </div>
              <div className="mb-8 w-24 rounded-xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur">
                <div className="h-14 rounded-md bg-gradient-to-br from-[#f472b6] to-[#ec4899]" />
                <div className="mt-1.5 h-1 w-full rounded bg-white/20" />
                <div className="mt-1 h-1 w-2/3 rounded bg-white/10" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-white/35">
            <span>© {new Date().getFullYear()} Sigma</span>
            <span>·</span>
            <span>{t("Built for product teams")}</span>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-10 lg:w-[520px] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white">
              <Sparkles className="size-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Sigma</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">{mode === "login" ? t("Welcome back") : t("Create your account")}</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {mode === "login" ? t("Sign in to keep designing with your team.") : t("Start prototyping in less than a minute.")}
          </p>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "register")} className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                {t("Sign in")}
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1">
                {t("Sign up")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("Name")}</Label>
                <div className="relative">
                  <UserIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="h-10 pl-8"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("Email")}</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-10 pl-8"
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("Password")}</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("At least 6 characters")}
                  className="h-10 pl-8 pr-9"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={busy} className="h-10 w-full">
              {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? t("Sign in") : t("Create account")}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

          {oidc?.enabled && (
            <Button
              variant="outline"
              className="mt-4 h-10 w-full gap-2"
              disabled={busy}
              onClick={() => {
                const returnTo = window.location.pathname === "/login" ? "/" : window.location.pathname + window.location.search;
                window.location.href = `/api/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              <ShieldCheck className="size-4 text-primary" />
              {t("Continue with {provider}", { provider: oidc.label || t("Single sign-on") })}
            </Button>
          )}

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" onClick={demo} disabled={busy} className="h-10 w-full">
            <Sparkles className="size-4 text-primary" /> {t("Explore the demo workspace")}
          </Button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            {t("Demo account:")} <span className="text-foreground">demo@sigma.design</span> ·{" "}
            <span className="text-foreground">demo1234</span>
          </p>

          <p className="mt-10 text-center text-[10px] leading-relaxed text-muted-foreground">
            {t("By continuing you agree to the Sigma terms of service and privacy policy.")}
          </p>
        </div>
      </div>
    </div>
  );
}
