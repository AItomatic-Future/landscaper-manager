import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  profile: {
    role: 'user' | 'project_manager' | 'Team_Leader' | 'Admin' | 'boss';
    full_name: string;
    email: string;
  } | null;
  theme: 'light' | 'dark';
  setUser: (user: User | null) => void;
  setProfile: (profile: AuthState['profile']) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      theme: 'light',
      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'auth-storage',
    }
  )
);
