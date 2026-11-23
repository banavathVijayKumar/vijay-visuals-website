import React, { useEffect, useState } from 'react';
import { initSupabaseClient, authService, UserProfile, UserRole } from '../../lib/supabase';
import { X, Lock, Mail, User, Phone, KeyRound, CheckCircle2 } from 'lucide-react';
import { VijayVisualsLogo } from '../VijayVisualsLogo';

export type AuthModalMode = 'signin' | 'register' | 'forgot' | 'reset_password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  defaultRole?: UserRole;
  initialMode?: AuthModalMode;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultRole = 'customer',
  initialMode = 'signin',
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setInfo(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const switchMode = (next: AuthModalMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      const client = await initSupabaseClient();
      if (!client) {
        setError(
          'Secure sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the site environment, then redeploy.'
        );
        return;
      }

      // 1. Forgot Password — send real Supabase recovery email
      if (mode === 'forgot') {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
          setError('Please enter your registered email address.');
          return;
        }
        const { error: resetError } = await client.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setInfo(
          'Password reset link sent! Check your email inbox (and spam folder) to set a new password.'
        );
        return;
      }

      // 2. Complete Password Recovery — set new password
      if (mode === 'reset_password') {
        if (password.length < 6) {
          setError('New password must be at least 6 characters long.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        const { error: updateErr } = await client.auth.updateUser({ password });
        if (updateErr) throw updateErr;
        setPassword('');
        setConfirmPassword('');
        setInfo('Password updated successfully! You can now continue signed in.');
        setMode('signin');
        return;
      }

      // 3. Register or Sign In
      if (mode === 'register') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
              requested_role: defaultRole === 'shop_owner' ? 'shop_owner' : 'customer',
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session || !data.user) {
          setInfo('Registration received! Check your email to confirm your account, then sign in.');
          setMode('signin');
          return;
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) throw signInError;
      }

      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) {
        throw new Error('Your secure session could not be created. Please sign in again.');
      }

      const { data: profileRow, error: profileError } = await client
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('id', session.user.id)
        .single();
      if (profileError || !profileRow) {
        await client.auth.signOut();
        throw new Error('Your account profile could not be verified. Please contact support.');
      }
      const allowedRoles: UserRole[] = [
        'super_admin',
        'admin',
        'shop_owner',
        'delivery_boy',
        'customer',
        'support_agent',
      ];
      if (!allowedRoles.includes(profileRow.role as UserRole)) {
        await client.auth.signOut();
        throw new Error('Your account has an unsupported access role.');
      }
      if (mode === 'register' && defaultRole === 'shop_owner' && profileRow.role !== 'shop_owner') {
        await client.auth.signOut();
        throw new Error('Shop Owner access was not assigned. Please contact support.');
      }
      const role = profileRow.role as UserRole;
      const profileName = String(
        profileRow.full_name || session.user.user_metadata?.full_name || fullName || 'Customer'
      );

      const profile: UserProfile = {
        id: session.user.id,
        email: session.user.email || email.trim().toLowerCase(),
        full_name: profileName,
        phone: String(session.user.user_metadata?.phone || phone || ''),
        role,
        status: 'active',
        email_verified: Boolean(session.user.email_confirmed_at),
        created_at: profileRow.created_at || session.user.created_at || new Date().toISOString(),
      };
      authService.setCurrentUser(profile);
      onSuccess(profile);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === 'register'
      ? 'Create Your Account'
      : mode === 'forgot'
        ? 'Recover Your Password'
        : mode === 'reset_password'
          ? 'Set New Password'
          : 'Welcome Back';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2A] mb-4">
          <div className="flex items-center gap-3">
            <VijayVisualsLogo variant="icon" size="sm" mode="dark" />
            <div>
              <h3 className="font-luxury font-bold text-white text-base">{heading}</h3>
              <p className="text-[11px] text-[#868698]">Secure Vijay Visuals account</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#848496] hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-[#2D1418] border border-[#E53E3E]/50 text-[#FFBDBD] text-xs">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 rounded bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              <label className="block text-[11px] text-[#B0B0C0]">
                Full Name
                <div className="relative mt-1">
                  <User className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white"
                    placeholder="Your name"
                  />
                </div>
              </label>
              <label className="block text-[11px] text-[#B0B0C0]">
                Mobile Number
                <div className="relative mt-1">
                  <Phone className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white"
                    placeholder="+91 mobile number"
                  />
                </div>
              </label>
            </>
          )}

          {mode !== 'reset_password' && (
            <label className="block text-[11px] text-[#B0B0C0]">
              Email Address
              <div className="relative mt-1">
                <Mail className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white"
                  placeholder="you@domain.com"
                />
              </div>
            </label>
          )}

          {(mode === 'signin' || mode === 'register' || mode === 'reset_password') && (
            <label className="block text-[11px] text-[#B0B0C0]">
              {mode === 'reset_password' ? 'New Password' : 'Password'}
              <div className="relative mt-1">
                <Lock className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                <input
                  required
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white"
                  placeholder="At least 6 characters"
                />
              </div>
            </label>
          )}

          {mode === 'reset_password' && (
            <label className="block text-[11px] text-[#B0B0C0]">
              Confirm New Password
              <div className="relative mt-1">
                <KeyRound className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                <input
                  required
                  minLength={6}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white"
                  placeholder="Re-enter new password"
                />
              </div>
            </label>
          )}

          {mode === 'signin' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-[11px] text-[#DFBA5A] hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            disabled={busy}
            type="submit"
            className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {busy
              ? 'Please wait…'
              : mode === 'register'
                ? 'Create Secure Account'
                : mode === 'forgot'
                  ? 'Send Password Reset Link'
                  : mode === 'reset_password'
                    ? 'Update Password'
                    : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-[#1C1C28] text-center text-[11px] text-[#8C8C9E]">
          {mode === 'register' ? (
            <>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-[#DFBA5A] hover:underline font-bold"
              >
                Sign In
              </button>
            </>
          ) : mode === 'forgot' || mode === 'reset_password' ? (
            <>
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-[#DFBA5A] hover:underline font-bold"
              >
                Back to Sign In
              </button>
            </>
          ) : (
            <>
              New to Vijay Visuals?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-[#DFBA5A] hover:underline font-bold"
              >
                Create Account
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-[10px] text-center text-[#666678]">
          Admin access is assigned securely by the platform administrator. Choosing an admin role in
          the browser is not permitted.
        </p>
      </div>
    </div>
  );
};
