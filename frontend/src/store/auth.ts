import { create } from "zustand";
import { authApi, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  ssoLogin: (code: string) => Promise<string>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  loading: true,
  init: async () => {
    const token = getToken();
    if (!token) {
      set({ loading: false, user: null, token: null });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user, token, loading: false });
    } catch {
      setToken(null);
      set({ user: null, token: null, loading: false });
    }
  },
  login: async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    setToken(token);
    set({ token, user, loading: false });
  },
  register: async (name, email, password) => {
    const { token, user } = await authApi.register(name, email, password);
    setToken(token);
    set({ token, user, loading: false });
  },
  ssoLogin: async (code) => {
    const { token, user, returnTo } = await authApi.oidcExchange(code);
    setToken(token);
    set({ token, user, loading: false });
    return returnTo || "/";
  },
  logout: () => {
    setToken(null);
    set({ user: null, token: null });
  },
  setUser: (user) => set({ user }),
}));
