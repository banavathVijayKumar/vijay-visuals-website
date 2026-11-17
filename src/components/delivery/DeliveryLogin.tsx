import React, { useState } from 'react';
import { authService, deliveryService, UserProfile } from '../../lib/supabase';
import { Bike, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2, ShieldCheck, KeyRound, Sparkles, Phone, Eye, EyeOff } from 'lucide-react';

interface DeliveryLoginProps {
  onSuccess: (user: UserProfile) => void;
  onNavigateHome: () => void;
}

export const DeliveryLogin: React.FC<DeliveryLoginProps> = ({ onSuccess, onNavigateHome }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  // Invite token completion state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Check URL params for invite token if present
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const emailParam = params.get('email');
    if (token) {
      setInviteToken(token);
      if (emailParam) setEmail(emailParam);
      setShowInviteModal(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate credentials & role strict check
      const result = authService.login(email, password, 'delivery_boy');

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.user) {
        onSuccess(result.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Delivery@123');
    setError(null);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    const res = authService.requestPasswordReset(forgotEmail);
    setForgotSent(true);
    setForgotMessage(res.message);
  };

  const handleCompleteInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim() || !newPassword.trim()) {
      setError('Please provide the invitation token and your new password.');
      return;
    }

    const res = deliveryService.completeInviteSignup(inviteToken, newPassword);
    if (!res.success) {
      setError(res.error || 'Failed to activate account.');
      return;
    }

    setInviteSuccess(true);
    setTimeout(() => {
      if (res.user) {
        onSuccess(res.user);
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#07070A] text-[#E8E8ED] flex flex-col justify-between relative overflow-hidden py-10 px-4 sm:px-6">
      {/* Ambient luxury glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#1E7E34]/15 via-[#DFBA5A]/10 to-transparent rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <div className="max-w-6xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[#1C1C24] relative z-10">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 text-white font-luxury font-bold tracking-widest text-base hover:text-[#DFBA5A] transition-colors"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black shadow-md">
            VV
          </span>
          <span>VIJAY VISUALS</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[#8C8C9E] hidden sm:inline">
            Authorized Personnel Only
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12121A] border border-[#22222E] text-xs text-[#25D366]">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span>Delivery Fleet</span>
          </div>
        </div>
      </div>

      {/* Login Card Container */}
      <div className="max-w-md w-full mx-auto my-auto relative z-10 pt-6 pb-8">
        <div className="bg-[#0E0E15] border border-[#242434] rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          
          {/* Badge Icon */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1E7E34] to-[#128C7E] p-0.5 shadow-xl shadow-[#25D366]/20 mx-auto mb-5 flex items-center justify-center">
            <div className="w-full h-full bg-[#09090D] rounded-2xl flex items-center justify-center text-[#25D366]">
              <Bike className="w-7 h-7" />
            </div>
          </div>

          <div className="text-center mb-6">
            <span className="text-[11px] font-mono text-[#DFBA5A] uppercase tracking-widest block font-semibold">
              Logistics & Dispatch Fleet
            </span>
            <h1 className="font-luxury text-2xl font-bold text-white mt-1">
              Delivery Partner Login
            </h1>
            <p className="text-xs text-[#8A8A9C] mt-1.5">
              Access your assigned orders, client locations, and delivery status console.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-[#2A1215] border border-[#E53E3E]/50 text-xs text-[#FFC0C0] flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-[#FF6B6B] shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                Registered Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="e.g. delivery1@vijayvisuals.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#DFBA5A] text-white text-xs placeholder:text-[#5F5F70] focus:outline-none transition-colors font-mono"
                />
                <Mail className="w-4 h-4 text-[#666678] absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#C8C8D6]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-[#DFBA5A] hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#DFBA5A] text-white text-xs placeholder:text-[#5F5F70] focus:outline-none transition-colors font-mono"
                />
                <Lock className="w-4 h-4 text-[#666678] absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#666678] hover:text-white"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <span>Verifying Role Credentials...</span>
              ) : (
                <>
                  <span>Sign In to Delivery Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Credentials (for instantaneous testing) */}
          <div className="mt-6 pt-5 border-t border-[#1C1C28]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#79798C] block text-center mb-2.5">
              Quick Test Credentials
            </span>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleQuickDemoFill('delivery1@vijayvisuals.com')}
                className="w-full p-2.5 rounded bg-[#13131D] hover:bg-[#181824] border border-[#20202E] text-left text-xs transition-colors flex items-center justify-between group"
              >
                <div>
                  <p className="font-semibold text-white group-hover:text-[#DFBA5A] transition-colors">
                    Ramesh Kumar (Active Delivery Partner)
                  </p>
                  <p className="text-[10px] font-mono text-[#78788A]">
                    delivery1@vijayvisuals.com · Bike (Banjara Hills)
                  </p>
                </div>
                <span className="text-[10px] text-[#DFBA5A] font-mono underline">Auto Fill</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoFill('suresh.delivery@vijayvisuals.com')}
                className="w-full p-2.5 rounded bg-[#13131D] hover:bg-[#181824] border border-[#20202E] text-left text-xs transition-colors flex items-center justify-between group"
              >
                <div>
                  <p className="font-semibold text-white group-hover:text-[#DFBA5A] transition-colors">
                    Suresh Reddy (EV Partner)
                  </p>
                  <p className="text-[10px] font-mono text-[#78788A]">
                    suresh.delivery@vijayvisuals.com · EV (Hitec City)
                  </p>
                </div>
                <span className="text-[10px] text-[#DFBA5A] font-mono underline">Auto Fill</span>
              </button>
            </div>
          </div>

          {/* Invitation code link */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowInviteModal(true)}
              className="text-[11px] text-[#A0A0B2] hover:text-[#ECC86A] underline"
            >
              Have an invitation code from Admin? Set Password
            </button>
          </div>

        </div>

        {/* Security Notice */}
        <div className="mt-4 p-3 rounded-lg bg-[#0A0A0E] border border-[#1A1A24] flex items-center gap-2.5 text-[11px] text-[#78788A]">
          <ShieldCheck className="w-4 h-4 text-[#DFBA5A] shrink-0" />
          <span>
            Protected with Row Level Security (RLS). Delivery boys can view only their own assigned deliveries.
          </span>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="text-center text-[11px] text-[#555566] relative z-10 pt-4">
        © {new Date().getFullYear()} Vijay Visuals Logistics Network. All rights reserved.
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E15] border border-[#2B2B3C] rounded-xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[#181824] border border-[#2A2A38] flex items-center justify-center text-[#DFBA5A]">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury font-bold text-white text-base">Reset Password</h3>
                <p className="text-[11px] text-[#868698]">Delivery Partner Account</p>
              </div>
            </div>

            {forgotSent ? (
              <div className="space-y-4 py-2">
                <div className="p-3 bg-[#112415] border border-[#25D366]/40 rounded-lg text-xs text-[#B9F5C8] leading-relaxed">
                  {forgotMessage}
                </div>
                <button
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotSent(false);
                  }}
                  className="w-full py-2.5 rounded bg-[#181824] text-white text-xs font-semibold hover:bg-[#202030]"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-[#9E9EAF] leading-relaxed">
                  Enter your registered delivery email address to generate a secure password reset link.
                </p>
                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">Your Email</label>
                  <input
                    type="email"
                    required
                    placeholder="delivery1@vijayvisuals.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-2 rounded text-xs text-[#8A8A9C] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Set Password from Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E15] border border-[#2B2B3C] rounded-xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[#181824] border border-[#2A2A38] flex items-center justify-center text-[#DFBA5A]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury font-bold text-white text-base">Activate Invitation</h3>
                <p className="text-[11px] text-[#868698]">New Delivery Partner Onboarding</p>
              </div>
            </div>

            {inviteSuccess ? (
              <div className="space-y-4 py-4 text-center">
                <CheckCircle2 className="w-10 h-10 text-[#25D366] mx-auto" />
                <p className="text-xs text-[#B9F5C8] font-semibold">
                  Account Activated! Logging you into the delivery dashboard...
                </p>
              </div>
            ) : (
              <form onSubmit={handleCompleteInvite} className="space-y-4">
                <p className="text-xs text-[#9E9EAF] leading-relaxed">
                  Enter your invitation token and create a strong password to activate your delivery account.
                </p>
                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">Invitation Token</label>
                  <input
                    type="text"
                    required
                    placeholder="inv_anil_9921b7_token"
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">Create New Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-3 py-2 rounded text-xs text-[#8A8A9C] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold"
                  >
                    Activate Account
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
