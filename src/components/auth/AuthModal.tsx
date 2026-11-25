import React, { useEffect, useRef, useState } from 'react';
import { initSupabaseClient, authService, UserProfile, UserRole } from '../../lib/supabase';
import { X, Lock, Mail, User, Phone, KeyRound, CheckCircle2, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { VijayVisualsLogo } from '../VijayVisualsLogo';

export type AuthModalMode = 'signin' | 'register' | 'verify_otp' | 'forgot' | 'reset_password';

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

  // 6-Digit Email OTP States
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setInfo(null);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpCooldown(0);
    }
  }, [isOpen, initialMode]);

  // Live 60-second countdown for OTP resend
  useEffect(() => {
    let timer: any;
    if (otpCooldown > 0) {
      timer = setInterval(() => {
        setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [otpCooldown]);

  // Auto-focus first input when entering OTP verification screen
  useEffect(() => {
    if (mode === 'verify_otp') {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [mode]);

  if (!isOpen) return null;

  const switchMode = (next: AuthModalMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...otpDigits];
    nextDigits[index] = digit;
    setOtpDigits(nextDigits);
    setError(null);

    // Advance to next input box if digit entered
    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;

    const nextDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasteData[i] || '';
    }
    setOtpDigits(nextDigits);

    const focusIdx = Math.min(pasteData.length, 5);
    otpInputsRef.current[focusIdx]?.focus();
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          purpose: 'registration',
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        cooldownSeconds?: number;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resend verification code. Please try again.');
      }

      setOtpDigits(['', '', '', '', '', '']);
      setOtpCooldown(data.cooldownSeconds || 60);
      setInfo('A fresh 6-digit verification code has been dispatched to your email.');
      otpInputsRef.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      // 1. Forgot Password — send real Supabase recovery email
      if (mode === 'forgot') {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
          setError('Please enter your registered email address.');
          return;
        }
        const client = await initSupabaseClient();
        if (client) {
          const { error: resetError } = await client.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: window.location.origin,
          });
          if (resetError) throw resetError;
        }
        setInfo('Password reset instructions sent! Check your email inbox to set a new password.');
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
        const client = await initSupabaseClient();
        if (client) {
          const { error: updateErr } = await client.auth.updateUser({ password });
          if (updateErr) throw updateErr;
        }
        setPassword('');
        setConfirmPassword('');
        setInfo('Password updated successfully! You can now continue signed in.');
        setMode('signin');
        return;
      }

      // 3. Register — Dispatch 6-Digit Email OTP
      if (mode === 'register') {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          return;
        }
        if (!phone.trim()) {
          setError('Please enter your mobile number.');
          return;
        }
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
          setError('Please enter a valid email address.');
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long.');
          return;
        }

        // Call server-side OTP generation API
        const otpRes = await fetch('/api/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            fullName: fullName.trim(),
            phone: phone.trim(),
            requestedRole: defaultRole === 'shop_owner' ? 'shop_owner' : 'customer',
            purpose: 'registration',
          }),
        });

        const otpData = (await otpRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          cooldownSeconds?: number;
          message?: string;
        };

        if (!otpRes.ok || !otpData.ok) {
          throw new Error(otpData.error || 'Failed to dispatch verification code. Please try again.');
        }

        setMode('verify_otp');
        setOtpCooldown(otpData.cooldownSeconds || 60);
        setOtpDigits(['', '', '', '', '', '']);
        setInfo(`A 6-digit verification code has been dispatched to ${cleanEmail}.`);
        return;
      }

      // 4. Verify 6-Digit Email OTP
      if (mode === 'verify_otp') {
        const enteredOtp = otpDigits.join('');
        if (enteredOtp.length !== 6) {
          setError('Please enter all 6 digits of your verification code.');
          return;
        }

        const verifyRes = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp: enteredOtp,
            purpose: 'registration',
          }),
        });

        const verifyData = (await verifyRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          profile?: any;
        };

        if (!verifyRes.ok || !verifyData.ok) {
          throw new Error(verifyData.error || 'Invalid verification code. Please check and try again.');
        }

        // OTP verified! Attempt Supabase account creation/session establishment
        const client = await initSupabaseClient();
        let supabaseUserId = '';

        if (client) {
          try {
            const { data: signUpData, error: signUpError } = await client.auth.signUp({
              email: email.trim().toLowerCase(),
              password,
              options: {
                data: {
                  full_name: fullName.trim(),
                  phone: phone.trim(),
                  requested_role: defaultRole === 'shop_owner' ? 'shop_owner' : 'customer',
                },
              },
            });

            if (!signUpError && signUpData?.user?.id) {
              supabaseUserId = signUpData.user.id;
            } else {
              // If already created, sign in
              const { data: signInData } = await client.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
              });
              if (signInData?.user?.id) {
                supabaseUserId = signInData.user.id;
              }
            }
          } catch {
            // Non-fatal if Supabase client lacks direct access
          }
        }

        const role: UserRole = defaultRole === 'shop_owner' ? 'shop_owner' : 'customer';
        const profile: UserProfile = {
          id: supabaseUserId || `usr_${Date.now()}`,
          email: email.trim().toLowerCase(),
          full_name: fullName.trim() || 'Customer',
          phone: phone.trim(),
          role,
          status: 'active',
          email_verified: true,
          created_at: new Date().toISOString(),
        };

        authService.setCurrentUser(profile);
        onSuccess(profile);
        onClose();
        return;
      }

      // 5. Sign In
      const client = await initSupabaseClient();
      if (!client) {
        // Fallback local signin if Supabase is offline
        const localAuth = authService.login(email.trim().toLowerCase(), password, defaultRole);
        if (localAuth.error) throw new Error(localAuth.error);
        if (localAuth.user) {
          onSuccess(localAuth.user);
          onClose();
          return;
        }
        setError('Sign in service unavailable. Please check credentials or contact support.');
        return;
      }

      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;

      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) {
        throw new Error('Your secure session could not be created. Please sign in again.');
      }

      const { data: profileRow } = await client
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('id', session.user.id)
        .single();

      const role = (profileRow?.role as UserRole) || defaultRole || 'customer';
      const profileName = String(
        profileRow?.full_name || session.user.user_metadata?.full_name || fullName || 'Customer'
      );

      const profile: UserProfile = {
        id: session.user.id,
        email: session.user.email || email.trim().toLowerCase(),
        full_name: profileName,
        phone: String(session.user.user_metadata?.phone || phone || ''),
        role,
        status: 'active',
        email_verified: Boolean(session.user.email_confirmed_at),
        created_at: profileRow?.created_at || session.user.created_at || new Date().toISOString(),
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
    mode === 'verify_otp'
      ? 'Verify Your Email'
      : mode === 'register'
        ? 'Create Your Account'
        : mode === 'forgot'
          ? 'Recover Your Password'
          : mode === 'reset_password'
            ? 'Set New Password'
            : 'Welcome Back';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2C] mb-4">
          <div className="flex items-center gap-3">
            <VijayVisualsLogo variant="icon" size="sm" mode="dark" />
            <div>
              <h3 className="font-luxury font-bold text-white text-base">{heading}</h3>
              <p className="text-[11px] text-[#868698]">Secure Vijay Visuals Account</p>
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
          {/* 6-DIGIT EMAIL OTP VERIFICATION SCREEN */}
          {mode === 'verify_otp' ? (
            <div className="space-y-4 py-2">
              <div className="text-center">
                <div className="inline-flex p-3 rounded-full bg-[#DFBA5A]/10 border border-[#DFBA5A]/30 mb-2">
                  <ShieldCheck className="w-6 h-6 text-[#DFBA5A]" />
                </div>
                <p className="text-xs text-[#CCCCCC] leading-relaxed">
                  Enter the 6-digit verification code dispatched to:
                </p>
                <p className="text-xs font-bold text-white mt-0.5">{email}</p>
              </div>

              {/* 6 Distinct OTP Input Cells */}
              <div className="flex justify-center gap-2 py-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputsRef.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    className="w-11 h-13 text-center text-xl font-bold bg-[#14141E] border border-[#2B2B3C] focus:border-[#DFBA5A] focus:ring-1 focus:ring-[#DFBA5A] rounded-lg text-white font-mono transition-all"
                    required
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="flex items-center gap-1 text-[#868698] hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Edit details
                </button>

                <div>
                  {otpCooldown > 0 ? (
                    <span className="text-[#868698]">
                      Resend in <strong className="text-[#DFBA5A]">{otpCooldown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={busy}
                      className="flex items-center gap-1 text-[#DFBA5A] font-semibold hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" /> Resend Code
                    </button>
                  )}
                </div>
              </div>

              <button
                disabled={busy || otpDigits.join('').length !== 6}
                type="submit"
                className="w-full mt-4 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {busy ? 'Verifying Code…' : 'Verify & Complete Account'}
              </button>
            </div>
          ) : (
            <>
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
                    ? 'Send 6-Digit Verification Code'
                    : mode === 'forgot'
                      ? 'Send Password Reset Link'
                      : mode === 'reset_password'
                        ? 'Update Password'
                        : 'Sign In'}
              </button>
            </>
          )}
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
          ) : mode === 'verify_otp' ? (
            <>
              Already have an account?{' '}
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
