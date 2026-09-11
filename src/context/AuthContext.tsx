import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { UserProfile, UserRole, Restaurant, RestaurantMember, RestaurantMemberPermissions } from '../types';
import { authService } from '../services/api/authService';
import { restaurantService } from '../services/api/restaurantService';
import { staffService } from '../services/api/staffService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { pendingRedirectUtil } from '../utils/pendingRedirect';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  loading: boolean;
  activeRestaurantId: string;
  activeRestaurant: Restaurant | null;
  userMemberships: RestaurantMember[];
  memberPermissions: RestaurantMemberPermissions | null;
  hasPermission: (key: keyof RestaurantMemberPermissions) => boolean;
  refreshPermissions: () => Promise<void>;
  setActiveRestaurantId: (restaurantId: string) => void;
  login: (email: string, password?: string) => Promise<UserProfile>;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<UserProfile>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isCustomer: boolean;
  pendingTableId: string | null;
  setPendingTableId: (tableId: string) => Promise<void>;
  consumePendingTableId: () => Promise<string | null>;
  superAdminMarketplacePreview: boolean;
  setSuperAdminMarketplacePreview: (enabled: boolean) => void;
  updateUserProfileState: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingTableId, setPendingTableIdState] = useState<string | null>(null);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string>('');
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [userMemberships, setUserMemberships] = useState<RestaurantMember[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<RestaurantMemberPermissions | null>(null);
  const [superAdminMarketplacePreview, setSuperAdminMarketplacePreview] = useState<boolean>(false);
  const loadContextSeqRef = React.useRef<number>(0);
  const activeRestaurantIdRef = React.useRef<string>('');

  const loadRestaurantContext = async (currentUser: UserProfile | null, eventName: string = 'MANUAL') => {
    const seq = ++loadContextSeqRef.current;
    const timestamp = new Date().toISOString();
    const activeRestaurantIdBefore = activeRestaurantIdRef.current;

    let sessionExists = false;
    let sessionUserId: string | null = null;
    let sessionUserEmail: string | null = null;

    if (isSupabaseConfigured) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentSession = sessionData?.session;
        if (currentSession?.user) {
          sessionExists = true;
          sessionUserId = currentSession.user.id;
          sessionUserEmail = currentSession.user.email || null;
        }
      } catch (sessErr) {
        if (__DEV__) console.log(`[AUTHCTX] [${timestamp}] [seq:${seq}] [event:${eventName}] getSession check error:`, sessErr);
      }
    }

    const profileRole = (currentUser?.role || '').toUpperCase() || 'NONE';

    if (__DEV__) {
      console.log(
        `[AUTHCTX] [${timestamp}] [seq:${seq}] [event:${eventName}] loadRestaurantContext START | ` +
        `session exists: ${sessionExists ? 'YES' : 'NO'} | ` +
        `session.user.id: ${sessionUserId || 'null'} | ` +
        `session.user.email: ${sessionUserEmail || 'null'} | ` +
        `profile role: ${profileRole} | ` +
        `activeRestaurantId before: "${activeRestaurantIdBefore}"`
      );
    }

    // If no session exists yet (e.g. startup / restoring / signed-out)
    if (!sessionExists || !sessionUserId) {
      if (eventName === 'SIGNED_OUT' || eventName === 'LOGOUT_ACTION' || currentUser === null) {
        if (seq !== loadContextSeqRef.current) {
          if (__DEV__) {
            console.log(`[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] Result ignored as stale (current seq: ${loadContextSeqRef.current})`);
          }
          return;
        }
        activeRestaurantIdRef.current = '';
        setActiveRestaurantId('');
        setActiveRestaurant(null);
        setUserMemberships([]);
        setMemberPermissions(null);
        if (__DEV__) {
          console.log(
            `[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] loadRestaurantContext END (cleared for signed-out) | ` +
            `activeRestaurantId after: ""`
          );
        }
        return;
      }

      // Startup / unauthenticated loading state: DO NOT throw false error or clear valid restaurant state
      if (__DEV__) {
        console.log(
          `[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] loadRestaurantContext END (session not ready yet, skipping membership query) | ` +
          `activeRestaurantId after: "${activeRestaurantIdRef.current}"`
        );
      }
      return;
    }

    const targetUserId = sessionUserId;

    // For CUSTOMER role, bypass membership query
    if (profileRole === 'CUSTOMER') {
      if (seq !== loadContextSeqRef.current) {
        if (__DEV__) {
          console.log(`[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] Result ignored as stale (current seq: ${loadContextSeqRef.current})`);
        }
        return;
      }
      activeRestaurantIdRef.current = '';
      setActiveRestaurantId('');
      setActiveRestaurant(null);
      setUserMemberships([]);
      setMemberPermissions(null);
      if (__DEV__) {
        console.log(
          `[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] loadRestaurantContext END (CUSTOMER user, no restaurant membership required) | ` +
          `activeRestaurantId after: ""`
        );
      }
      return;
    }

    try {
      const { restaurantId, membership, restaurant } =
        await restaurantService.getActiveRestaurantContext(targetUserId, profileRole, seq, eventName);

      if (seq !== loadContextSeqRef.current) {
        if (__DEV__) {
          console.log(`[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] Result ignored as stale (current seq: ${loadContextSeqRef.current})`);
        }
        return;
      }

      const memberships = await restaurantService.getUserMemberships(targetUserId, seq, eventName);

      if (seq !== loadContextSeqRef.current) {
        if (__DEV__) {
          console.log(`[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] Result ignored as stale (current seq: ${loadContextSeqRef.current})`);
        }
        return;
      }

      activeRestaurantIdRef.current = restaurantId;
      setUserMemberships(memberships || []);
      setActiveRestaurantId(restaurantId);
      setActiveRestaurant(restaurant);

      // Load permissions
      const perms = await staffService.getCurrentUserPermissions(targetUserId, restaurantId);
      if (seq === loadContextSeqRef.current) {
        setMemberPermissions(perms);
      }

      if (__DEV__) {
        console.log(
          `[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] loadRestaurantContext END (SUCCESS) | ` +
          `activeRestaurantId after: "${restaurantId}"`
        );
      }
    } catch (e: any) {
      if (seq !== loadContextSeqRef.current) {
        if (__DEV__) {
          console.log(`[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] Error ignored as stale (current seq: ${loadContextSeqRef.current}):`, e.message || e);
        }
        return;
      }

      console.warn('loadRestaurantContext error:', e.message || e);
      // Clean active state so tenant user is not silently bound to another restaurant
      activeRestaurantIdRef.current = '';
      setActiveRestaurantId('');
      setActiveRestaurant(null);
      setUserMemberships([]);
      setMemberPermissions(null);

      if (__DEV__) {
        console.log(
          `[AUTHCTX] [${new Date().toISOString()}] [seq:${seq}] [event:${eventName}] loadRestaurantContext END (ERROR) | ` +
          `activeRestaurantId after: ""`
        );
      }

      // For ADMIN and STAFF users, propagate the membership error
      if (profileRole === 'ADMIN' || profileRole === 'STAFF') {
        throw e;
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Initial user & pending table load from persistent storage
    const initializeAuth = async () => {
      try {
        let u: UserProfile | null = null;
        if (isSupabaseConfigured) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            u = await authService.getCurrentUser();
          }
        } else {
          u = await authService.getCurrentUser();
        }

        const tblId = await pendingRedirectUtil.getPendingTableId();
        if (!isMounted) return;
        setUser(u);
        setPendingTableIdState(tblId);
        if (u) {
          await loadRestaurantContext(u, 'INITIAL_LOAD');
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Supabase Auth listener for session persistence across Android restarts & token refreshes
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          if (session?.user) {
            const current = await authService.getCurrentUser();
            if (isMounted && current) {
              setUser(current);
              await loadRestaurantContext(current, event);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setUser(null);
            await loadRestaurantContext(null, 'SIGNED_OUT');
            setLoading(false);
          }
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const setPendingTableId = async (tableId: string) => {
    setPendingTableIdState(tableId);
    await pendingRedirectUtil.setPendingTableId(tableId);
  };

  const consumePendingTableId = async (): Promise<string | null> => {
    const consumed = await pendingRedirectUtil.consumePendingTableId();
    setPendingTableIdState(null);
    return consumed;
  };

  const login = async (email: string, password?: string) => {
    setLoading(true);
    try {
      const loggedIn = await authService.login(email, password);
      setUser(loggedIn);
      await loadRestaurantContext(loggedIn, 'LOGIN_ACTION');
      return loggedIn;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    setLoading(true);
    try {
      const newUser = await authService.signUp(email, password, fullName, phone);
      setUser(newUser);
      await loadRestaurantContext(newUser, 'SIGNUP_ACTION');
      return newUser;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await authService.resetPassword(email);
  };

  const updatePassword = async (newPassword: string) => {
    await authService.updatePassword(newPassword);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setSuperAdminMarketplacePreview(false);
      await loadRestaurantContext(null, 'LOGOUT_ACTION');
    } finally {
      setLoading(false);
    }
  };

  const role: UserRole = (user?.role || 'CUSTOMER').toUpperCase() as UserRole;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN' || isSuperAdmin;
  const isStaff = role === 'STAFF' || isAdmin;
  const isCustomer = role === 'CUSTOMER';

  const hasPermission = (key: keyof RestaurantMemberPermissions): boolean => {
    if (isSuperAdmin || role === 'ADMIN') return true;
    if (!memberPermissions) return false;
    return Boolean(memberPermissions[key]);
  };

  const refreshPermissions = async () => {
    if (user?.id && activeRestaurantId) {
      const perms = await staffService.getCurrentUserPermissions(user.id, activeRestaurantId);
      setMemberPermissions(perms);
    }
  };

  const setCustomActiveRestaurantId = async (restaurantId: string) => {
    activeRestaurantIdRef.current = restaurantId;
    setActiveRestaurantId(restaurantId);
    try {
      const rest = await restaurantService.getRestaurantById(restaurantId);
      if (rest) {
        setActiveRestaurant(rest);
      }
    } catch (e) {
      console.warn('Error setting active restaurant:', e);
    }
  };

  const updateUserProfileState = (updates: Partial<UserProfile>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        activeRestaurantId,
        activeRestaurant,
        userMemberships,
        memberPermissions,
        hasPermission,
        refreshPermissions,
        setActiveRestaurantId: setCustomActiveRestaurantId,
        login,
        signUp,
        resetPassword,
        updatePassword,
        logout,
        isSuperAdmin,
        isAdmin,
        isStaff,
        isCustomer,
        pendingTableId,
        setPendingTableId,
        consumePendingTableId,
        superAdminMarketplacePreview,
        setSuperAdminMarketplacePreview,
        updateUserProfileState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
