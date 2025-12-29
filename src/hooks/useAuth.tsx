import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const LAST_ACTIVITY_KEY = 'lastActivityTimestamp';
const INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Update last activity timestamp
  const updateLastActivity = useCallback(() => {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  // Check if user has been inactive for more than 1 week
  const checkInactivity = useCallback(async () => {
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - parseInt(lastActivity, 10);
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
        // User has been inactive for more than 1 week, log them out
        await supabase.auth.signOut();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        return true;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Update activity on auth events
        if (session) {
          updateLastActivity();
        }
      }
    );

    // THEN check for existing session and inactivity
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if inactive for too long
        const wasInactive = await checkInactivity();
        if (!wasInactive) {
          setSession(session);
          setUser(session?.user ?? null);
          updateLastActivity();
        }
      }
      setLoading(false);
    };

    initAuth();

    return () => subscription.unsubscribe();
  }, [checkInactivity, updateLastActivity]);

  // Track user activity
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      updateLastActivity();
    };

    // Throttle activity updates to once per minute
    let lastUpdate = 0;
    const throttledHandler = () => {
      const now = Date.now();
      if (now - lastUpdate > 60000) { // 1 minute throttle
        lastUpdate = now;
        handleActivity();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, throttledHandler, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandler);
      });
    };
  }, [user, updateLastActivity]);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    if (!error) {
      updateLastActivity();
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      updateLastActivity();
    }
    return { error };
  };

  const signOut = async () => {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
