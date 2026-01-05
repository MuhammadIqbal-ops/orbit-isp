import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      setUser(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const response = await api.getUser();
    
    if (response.success && response.data) {
      const userData = (response.data as any).user || response.data;
      setUser(userData);
      setIsAdmin(userData.role === 'admin');
    } else {
      // Token invalid, clear it
      localStorage.removeItem('auth_token');
      setUser(null);
      setIsAdmin(false);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signOut = async () => {
    await api.logout();
    setUser(null);
    setIsAdmin(false);
    navigate("/auth");
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
