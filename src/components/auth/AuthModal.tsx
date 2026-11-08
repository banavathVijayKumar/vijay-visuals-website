import React, { useState } from 'react';
import {
  authService,
  UserProfile,
  UserRole,
  isSupabaseConfigured,
} from '../../lib/supabase';
import { X, Lock, Mail, User, Check } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  defaultRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  if (!isOpen) return null;

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setIsBusy(true);

    try {
      if (isResetMode) {
        const result = await authService.requestPasswordReset(email);
        if (!result.success) {
          setError(result.message);
        } else {
          setNotice(result.message);
        }
        return;
      }

      if (isRegister) {
        // Public registration always creates a customer account.
        const result = await authService.signUp(email, password, fullName);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.requiresEmailConfirmation) {
          setNotice(
            result.message ||
              'Registration successful. Check your email and confirm your account before signing in.'
          );
          setIsRegister(false);
          setPassword('');
          return;
        }
        if (result.user) {
          onSuccess(result.user);
          onClose();
        } else {
          setNotice(result.message || 'Account created. Please sign in.');
          setIsRegister(false);
        }
        return;
      }

      const result = await authService.login(email, password);
      if (result.error || !result.user) {
        setError(result.error || 'Unable to sign in. Please try again.');
        return;
      }

      onSuccess(result.user);
      onClose();
    } catch (err) {
      console.error('Authentication failed:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickFill = (targetEmail: string) => {
    setEmail(targetEmail);
    setPassword('Pass@123');
    setIsRegister(false);
    setIsResetMode(false);
    resetMessages();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in duration-150 text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2A] mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black">VV</span>
            <div>
              <h3 className="font-luxury font-bold text-white text-base">
                {isResetMode ? 'Reset Your Password' : isRegister ? 'Create Your Account' : 'Welcome Back'}
              </h3>
              <p className="text-[11px] text-[#868698]">Vijay Visuals Multi-Tenant Platform</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-[#848496] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div role="alert" className="mb-4 p-2.5 rounded bg-[#2D1418] border border-[#E53E3E]/50 text-[#FFBDBD] text-xs">{error}</div>}
        {notice && <div role="status" className="mb-4 p-2.5 rounded bg-[#14291B] border border-[#25A55B]/40 text-[#B8F0C8] text-xs">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && !isResetMode && (
            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
                <User className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] text-[#B0B0C0] block mb-1">Email Address</label>
            <div className="relative">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
              />
              <Mail className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
            </div>
          </div>

          {!isResetMode && (
            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                />
                <Lock className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] disabled:opacity-60 text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
          >
            {isBusy ? 'Please wait…' : isResetMode ? 'Send Reset Email' : isRegister ? 'Create Customer Account' : 'Sign In'}
          </button>
        </form>

        {!isRegister && !isResetMode && (
          <div className="mt-3 text-right">
            <button type="button" onClick={() => { setIsResetMode(true); resetMessages(); }} className="text-[11px] text-[#DFBA5A] hover:underline">
              Forgot password?
            </button>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-[#1C1C28] text-center text-[11px] text-[#8C8C9E]">
          {isResetMode ? (
            <button type="button" onClick={() => { setIsResetMode(false); resetMessages(); }} className="text-[#DFBA5A] hover:underline font-bold">Back to Sign In</button>
          ) : isRegister ? (
            <span>Already have an account?{' '}
              <button type="button" onClick={() => { setIsRegister(false); resetMessages(); }} className="text-[#DFBA5A] hover:underline font-bold">Log In</button>
            </span>
          ) : (
            <span>New to Vijay Visuals?{' '}
              <button type="button" onClick={() => { setIsRegister(true); resetMessages(); }} className="text-[#DFBA5A] hover:underline font-bold">Create Account</button>
            </span>
          )}
        </div>

        {!isSupabaseConfigured && !isRegister && !isResetMode && (
          <div className="mt-4 pt-3 border-t border-[#1C1C28] space-y-1.5">
            <span className="text-[10px] font-mono text-[#6A6A7C] uppercase block text-center">Local Demo Sign-In</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleQuickFill('admin@vijayvisuals.com')} className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]">Admin Demo</button>
              <button type="button" onClick={() => handleQuickFill('vikram@aurajewels.com')} className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]">Shop Owner Demo</button>
              <button type="button" onClick={() => handleQuickFill('rahul@gmail.com')} className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]">Customer Demo</button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-[#656579]">
          <Check className="w-3 h-3" /> Secure account authentication
        </div>
      </div>
    </div>
  );
};
