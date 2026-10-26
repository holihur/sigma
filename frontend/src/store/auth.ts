import { create } from "zustand";
import { authApi, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

const USER_KEY = "sigma.user";

function readCachedUser(): User | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode / storage full */
  }
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  ssoLogin: (code: string) => Promise<string>;
  updateProfile: (body: { name: string; color: string; avatar: string }) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

const bootToken = getToken();
const bootUser = bootToken ? readCachedUser() : null;

export const useAuth = create<AuthState>((set) => ({
  user: bootUser,
  token: bootToken,
  // With a cached profile, paint the workspace immediately and revalidate in
  // the background. The API still rejects an expired token.
  loading: !!bootToken && !bootUser,
  init: async () => {
    const token = getToken();
    if (!token) {
      set({ loading: false, user: null, token: null });
      return;
    }
    try {
      const { user } = await authApi.me();
      writeCachedUser(user);
      set({ user, token, loading: false });
    } catch {
      setToken(null);
      writeCachedUser(null);
      set({ user: null, token: null, loading: false });
    }
  },
  login: async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    setToken(token);
    writeCachedUser(user);
    set({ token, user, loading: false });
  },
  register: async (name, email, password) => {
    const { token, user } = await authApi.register(name, email, password);
    setToken(token);
    writeCachedUser(user);
    set({ token, user, loading: false });
  },
  ssoLogin: async (code) => {
    const { token, user, returnTo } = await authApi.oidcExchange(code);
    setToken(token);
    writeCachedUser(user);
    set({ token, user, loading: false });
    return returnTo || "/";
  },
  updateProfile: async (body) => {
    const { user } = await authApi.updateProfile(body);
    writeCachedUser(user);
    set({ user });
  },
  logout: () => {
    setToken(null);
    writeCachedUser(null);
    set({ user: null, token: null });
  },
  setUser: (user) => set({ user }),
}));
