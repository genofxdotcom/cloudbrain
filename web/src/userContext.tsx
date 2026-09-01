import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from './api';

interface UserCtx {
  user: { id: string; email: string; displayName?: string; isAdmin: boolean } | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserCtx>({
  user: null,
  loading: true,
  refresh: async () => undefined,
});

export function UserProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<UserCtx['user']>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { user: u } = await apiClient.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return <UserContext.Provider value={{ user, loading, refresh }}>{children}</UserContext.Provider>;
}

export function useUser(): UserCtx {
  return useContext(UserContext);
}
