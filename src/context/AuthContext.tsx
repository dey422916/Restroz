import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { UserProfile, UserRole, Restaurant, RestaurantMember, RestaurantMemberPermissions } from '../types';
import { authService } from '../services/api/authService';
import { restaurantService, DEFAULT_RESTAURANT_ID } from '../services/api/restaurantService';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingTableId, setPendingTableIdState] = useState<string | null>(null);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string>(DEFAULT_RESTAURANT_ID);
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [userMemberships, setUserMemberships] = useState<RestaurantMember[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<RestaurantMemberPermissions | null>(null);
  const [superAdminMarketplacePreview, setSuperAdminMarketplacePreview] = useState<boolean>(false);

  const loadRestaurantContext = async (currentUser: UserProfile | null) => {
    if (currentUser?.id) {
      try {
        const { restaurantId, membership, restaurant } =
          await restaurantService.getActiveRestaurantContext(currentUser.id);
        const memberships = await restaurantService.getUserMemberships(currentUser.id);
        setUserMemberships(memberships);
        setActiveRestaurantId(restaurantId);
        setActiveRestaurant(restaurant);

        // Load permissions
        const perms = await staffService.getCurrentUserPermissions(currentUser.id, restaurantId);
        setMemberPermissions(perms);
        return;
      } catch (e) {
        console.warn('loadRestaurantContext error:', e);
      }
    }
    const def = await restaurantService.getDefaultRestaurant();
    setActiveRestaurantId(def.id);
    setActiveRestaurant(def);
    setUserMemberships([]);
    setMemberPermissions(null);
  };

  useEffect(() => {
    // Initial user & pending table load
    Promise.all([
      authService.getCurrentUser(),
      pendingRedirectUtil.getPendingTableId(),
    ]).then(async ([u, tblId]) => {
      setUser(u);
      setPendingTableIdState(tblId);
      await loadRestaurantContext(u);
      setLoading(false);
    });

    // Supabase Auth listener for session persistence across Android restarts
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user) {
            const current = await authService.getCurrentUser();
            setUser(current);
            await loadRestaurantContext(current);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          await loadRestaurantContext(null);
          setLoading(false);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
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
      await loadRestaurantContext(loggedIn);
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
      await loadRestaurantContext(newUser);
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
      await loadRestaurantContext(null);
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
