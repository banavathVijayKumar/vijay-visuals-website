import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import {
  authService,
  getSupabaseClient,
  initSupabaseClient,
  isSupabaseConfigured as initialSupabaseConfigured,
  UserProfile as SupabaseUserProfile,
} from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { DeliveryPartnerRecord, TenantRecord, UserProfile } from '../types/platform';

function mapSupabaseRoleToPlatformRole(
  role?: string | null
): 'super_admin' | 'business_owner' | 'staff' | 'delivery_partner' | 'customer' {
  const r = (role || 'customer').toLowerCase();
  if (r === 'super_admin' || r === 'admin') return 'super_admin';
  if (r === 'shop_owner' || r === 'business_owner' || r === 'business_manager') return 'business_owner';
  if (r === 'delivery_boy' || r === 'delivery_partner') return 'delivery_partner';
  if (r === 'support_agent' || r === 'staff' || r === 'business_staff' || r === 'platform_staff') return 'staff';
  return 'customer';
}

function buildFallbackProfile(
  sbUser: SupabaseUser,
  profileRow?: { full_name?: string | null; role?: string | null; created_at?: string | null } | null
): UserProfile {
  return {
    id: 1,
    uid: sbUser.id,
    email: sbUser.email || '',
    name: String(
      profileRow?.full_name ||
        sbUser.user_metadata?.full_name ||
        sbUser.email?.split('@')[0] ||
        'Customer'
    ),
    phone: String(sbUser.user_metadata?.phone || ''),
    role: mapSupabaseRoleToPlatformRole(profileRow?.role || sbUser.user_metadata?.role),
    preferredLang: 'en',
    savedAddressesJson: '[]',
    createdAt: profileRow?.created_at || sbUser.created_at || new Date().toISOString(),
  };
}

interface AuthContextValue {
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  isSupabaseConfigured: boolean;
  profile: UserProfile | null;
  ownedTenants: TenantRecord[];
  deliveryProfiles: DeliveryPartnerRecord[];
  loading: boolean;
  authError: string | null;
  authModalOpen: boolean;
  authModalMode: 'signin' | 'register' | 'forgot' | 'reset_password';
  openAuthModal: (mode?: 'signin' | 'register' | 'forgot' | 'reset_password') => void;
  closeAuthModal: () => void;
  /** Opens the Supabase Auth modal (kept under signInWithGoogle name for UI component compatibility) */
  signInWithGoogle: () => Promise<void>;
  handleSupabaseAuthSuccess: (sbProfile: SupabaseUserProfile) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  supabaseUser: null,
  session: null,
  isSupabaseConfigured: initialSupabaseConfigured,
  profile: null,
  ownedTenants: [],
  deliveryProfiles: [],
  loading: true,
  authError: null,
  authModalOpen: false,
  authModalMode: 'signin',
  openAuthModal: () => {},
  closeAuthModal: () => {},
  signInWithGoogle: async () => {},
  handleSupabaseAuthSuccess: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(initialSupabaseConfigured);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownedTenants, setOwnedTenants] = useState<TenantRecord[]>([]);
  const [deliveryProfiles, setDeliveryProfiles] = useState<DeliveryPartnerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register' | 'forgot' | 'reset_password'>('signin');

  const syncUserFromSession = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession);
    setSupabaseUser(activeSession?.user || null);

    const client = getSupabaseClient();
    if (!activeSession?.user || !client) {
      setProfile(null);
      setOwnedTenants([]);
      setDeliveryProfiles([]);
      return;
    }

    const sbUser = activeSession.user;

    // 1. Read verified role directly from Supabase public.profiles (preserves existing GitHub RBAC)
    let sbProfileRow: { full_name?: string | null; role?: string | null; created_at?: string | null } | null = null;
    try {
      const { data } = await client
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('id', sbUser.id)
        .single();
      sbProfileRow = data || null;
    } catch {
      sbProfileRow = null;
    }

    const mappedProfile = buildFallbackProfile(sbUser, sbProfileRow);

    // 2. Hydrate owned websites & delivery profiles from Cloudflare D1 /api/me (graceful fallback)
    try {
      const data = await apiFetch<{
        user?: UserProfile;
        ownedTenants?: TenantRecord[];
        deliveryProfiles?: DeliveryPartnerRecord[];
      }>('/api/me');
      setProfile(data.user || mappedProfile);
      setOwnedTenants(data.ownedTenants || []);
      setDeliveryProfiles(data.deliveryProfiles || []);
      setAuthError(null);
    } catch {
      // Even if /api/me is unreachable in local static preview, keep verified Supabase profile active
      setProfile(mappedProfile);
      setOwnedTenants([]);
      setDeliveryProfiles([]);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const client = getSupabaseClient() || (await initSupabaseClient());
    if (!client) {
      setProfile(null);
      setOwnedTenants([]);
      setDeliveryProfiles([]);
      return;
    }
    setSupabaseReady(true);
    const { data } = await client.auth.getSession();
    await syncUserFromSession(data.session);
  }, [syncUserFromSession]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    initSupabaseClient()
      .then(async (client) => {
        if (!mounted) return;
        if (!client) {
          setSupabaseReady(false);
          setLoading(false);
          return;
        }
        setSupabaseReady(true);

        try {
          const { data } = await client.auth.getSession();
          if (mounted) {
            await syncUserFromSession(data.session);
          }
        } catch {
          // Session lookup failed; continue cleanly
        } finally {
          if (mounted) setLoading(false);
        }

        const { data: listener } = client.auth.onAuthStateChange(async (event, nextSession) => {
          if (!mounted) return;
          if (event === 'PASSWORD_RECOVERY') {
            setAuthModalMode('reset_password');
            setAuthModalOpen(true);
          }
          await syncUserFromSession(nextSession);
          setLoading(false);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [syncUserFromSession]);

  const openAuthModal = useCallback((mode: 'signin' | 'register' | 'forgot' | 'reset_password' = 'signin') => {
    setAuthError(null);
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthModalMode('signin');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthModalMode('signin');
    setAuthModalOpen(true);
  }, []);

  const handleSupabaseAuthSuccess = useCallback(
    async (sbProfile: SupabaseUserProfile) => {
      setProfile({
        id: 1,
        uid: sbProfile.id,
        email: sbProfile.email,
        name: sbProfile.full_name,
        phone: sbProfile.phone,
        role: mapSupabaseRoleToPlatformRole(sbProfile.role),
        preferredLang: 'en',
        savedAddressesJson: '[]',
        createdAt: sbProfile.created_at,
      });
      setAuthModalOpen(false);
      setAuthModalMode('signin');
      await refreshProfile();
    },
    [refreshProfile]
  );

  const logout = useCallback(async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    authService.logout();
    setSession(null);
    setSupabaseUser(null);
    setProfile(null);
    setOwnedTenants([]);
    setDeliveryProfiles([]);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        supabaseUser,
        session,
        isSupabaseConfigured: supabaseReady,
        profile,
        ownedTenants,
        deliveryProfiles,
        loading,
        authError,
        authModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        signInWithGoogle,
        handleSupabaseAuthSuccess,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
