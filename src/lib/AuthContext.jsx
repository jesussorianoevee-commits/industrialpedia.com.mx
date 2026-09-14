import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

let supabasePromise;
const getSupabase = () => {
  if (!supabasePromise) {
    supabasePromise = import('@/api/supabaseClient').then(({ supabase }) => supabase);
  }
  return supabasePromise;
};

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(data.user ?? null);
      setIsAuthenticated(Boolean(data.user));
      setAuthError(null);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let listener;

    (async () => {
      const supabase = await getSupabase();
      if (!active) return;

      checkUserAuth();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setIsAuthenticated(Boolean(session?.user));
        setIsLoadingAuth(false);
        setAuthChecked(true);
      });
      listener = data?.subscription;
    })();

    return () => {
      active = false;
      listener?.unsubscribe();
    };
  }, [checkUserAuth]);

  const logout = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      authChecked,
      logout,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
