import React, { useState } from 'react';
import {
  authService,
  deliveryService,
  UserProfile,
  isSupabaseConfigured,
} from '../../lib/supabase';
import {
  Bike,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface DeliveryLoginProps {
  onSuccess: (user: UserProfile) => void;
  onNavigateHome: () => void;
}

export const DeliveryLogin: React.FC<DeliveryLoginProps> = ({
  onSuccess,
  onNavigateHome,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Legacy invitation tokens are supported only in local demo mode.
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  React.useEffect(() => {
    if (isSupabaseConfigured) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const emailParam = params.get('email');
    if (token) {
      setInviteToken(token);
      if (emailParam) setEmail(emailParam);
      setShowInviteModal(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (loading) return;
    setLoading(true);

    try {
      const result = await authService.login(email, password, 'delivery_boy');
      if (result.error || !result.user) {
        setError(result.error || 'Login failed. Please check your credentials.');
        return;
      }
      if (result.user.status !== 'active') {
        await authService.logout();
        setError('Your delivery account is not active. Please contact the administrator.');
        return;
      }
      onSuccess(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Delivery@123');
    setError(null);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || forgotLoading) return;
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const result = await authService.requestPasswordReset(forgotEmail);
      setForgotMessage(result.message);
      setForgotSent(result.success);
    } catch (err) {
      setForgotMessage(err instanceof Error ? err.message : 'Unable to send reset email. Please try again.');
      setForgotSent(false);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCompleteInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim() || newPassword.length < 6) {
      setError('Enter a valid invitation token and a password with at least 6 characters.');
      return;
    }
    const result = deliveryService.completeInviteSignup(inviteToken, newPassword);
    if (!result.success || !result.user) {
      setError(result.error || 'Failed to activate account.');
      return;
    }
    setInviteSuccess(true);
    window.setTimeout(() => onSuccess(result.user!), 1000);
  };

  return (
    <div className="min-h-screen bg-[#07070A] text-[#E8E8ED] flex flex-col justify-between relative overflow-hidden py-10 px-4 sm:px-6">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#1E7E34]/15 via-[#DFBA5A]/10 to-transparent rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-6xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[#1C1C24] relative z-10">
        <button onClick={onNavigateHome} className="flex items-center gap-3 text-white font-luxury font-bold tracking-widest text-base hover:text-[#DFBA5A] transition-colors">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black shadow-md">VV</span>
          <span>VIJAY VISUALS</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[#8C8C9E] hidden sm:inline">Authorized Personnel Only</span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12121A] border border-[#22222E] text-xs text-[#25D366]">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span>Delivery Fleet</span>
          </div>
        </div>
      </div>

      <div className="max-w-md w-full mx-auto my-auto relative z-10 pt-6 pb-8">
        <div className="bg-[#0E0E15] border border-[#242434] rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1E7E34] to-[#128C7E] p-0.5 shadow-xl shadow-[#25D366]/20 mx-auto mb-5 flex items-center justify-center">
            <div className="w-full h-full bg-[#09090D] rounded-2xl flex items-center justify-center text-[#25D366]"><Bike className="w-7 h-7" /></div>
          </div>
          <div className="text-center mb-6">
            <span className="text-[11px] font-mono text-[#DFBA5A] uppercase tracking-widest block font-semibold">Logistics & Dispatch Fleet</span>
            <h1 className="font-luxury text-2xl font-bold text-white mt-1">Delivery Partner Login</h1>
            <p className="text-xs text-[#8A8A9C] mt-1.5">Access your assigned orders, client locations, and delivery status console.</p>
          </div>

          {error && <div role="alert" className="mb-5 p-3.5 rounded-lg bg-[#2A1215] border border-[#E53E3E]/50 text-xs text-[#FFC0C0] flex items-start gap-2.5"><AlertCircle className="w-4 h-4 text-[#FF6B6B] shrink-0 mt-0.5" /><div className="leading-relaxed">{error}</div></div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">Registered Email Address</label>
              <div className="relative">
                <input type="email" required autoComplete="username" placeholder="e.g. delivery1@vijayvisuals.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#DFBA5A] text-white text-xs placeholder:text-[#5F5F70] focus:outline-none transition-colors font-mono" />
                <Mail className="w-4 h-4 text-[#666678] absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#C8C8D6]">Password</label>
                <button type="button" onClick={() => { setForgotEmail(email); setShowForgotModal(true); setForgotSent(false); setForgotMessage(''); }} className="text-[11px] text-[#DFBA5A] hover:underline">Forgot Password?</button>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#DFBA5A] text-white text-xs placeholder:text-[#5F5F70] focus:outline-none transition-colors font-mono" />
                <Lock className="w-4 h-4 text-[#666678] absolute left-3 top-3 pointer-events-none" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-[#666678] hover:text-white" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50">
              {loading ? 'Verifying Credentials…' : <><span>Sign In to Delivery Console</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          {!isSupabaseConfigured && (
            <div className="mt-6 pt-5 border-t border-[#1C1C28]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#79798C] block text-center mb-2.5">Local Demo Credentials</span>
              <div className="space-y-2">
                <button type="button" onClick={() => handleQuickDemoFill('delivery1@vijayvisuals.com')} className="w-full p-2.5 rounded bg-[#13131D] hover:bg-[#181824] border border-[#20202E] text-left text-xs flex items-center justify-between group">
                  <div><p className="font-semibold text-white group-hover:text-[#DFBA5A]">Ramesh Kumar (Demo Delivery Partner)</p><p className="text-[10px] font-mono text-[#78788A]">delivery1@vijayvisuals.com · Bike (Banjara Hills)</p></div><span className="text-[10px] text-[#DFBA5A] underline">Auto Fill</span>
                </button>
                <button type="button" onClick={() => handleQuickDemoFill('suresh.delivery@vijayvisuals.com')} className="w-full p-2.5 rounded bg-[#13131D] hover:bg-[#181824] border border-[#20202E] text-left text-xs flex items-center justify-between group">
                  <div><p className="font-semibold text-white group-hover:text-[#DFBA5A]">Suresh Reddy (Demo EV Partner)</p><p className="text-[10px] font-mono text-[#78788A]">suresh.delivery@vijayvisuals.com · EV (Hitec City)</p></div><span className="text-[10px] text-[#DFBA5A] underline">Auto Fill</span>
                </button>
              </div>
            </div>
          )}

          {!isSupabaseConfigured && <div className="mt-4 text-center"><button type="button" onClick={() => setShowInviteModal(true)} className="text-[11px] text-[#A0A0B2] hover:text-[#ECC86A] underline">Have a local demo invitation code? Set Password</button></div>}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-[#0A0A0E] border border-[#1A1A24] flex items-center gap-2.5 text-[11px] text-[#78788A]"><ShieldCheck className="w-4 h-4 text-[#DFBA5A] shrink-0" /><span>Delivery access is checked against your authenticated account role and active profile.</span></div>
      </div>

      <div className="text-center text-[11px] text-[#555566] relative z-10 pt-4">© {new Date().getFullYear()} Vijay Visuals Logistics Network. All rights reserved.</div>

      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E15] border border-[#2B2B3C] rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4"><div className="w-9 h-9 rounded-lg bg-[#181824] border border-[#2A2A38] flex items-center justify-center text-[#DFBA5A]"><KeyRound className="w-5 h-5" /></div><div><h3 className="font-luxury font-bold text-white text-base">Reset Password</h3><p className="text-[11px] text-[#868698]">Delivery Partner Account</p></div></div>
            {forgotSent ? <div className="space-y-4 py-2"><div role="status" className="p-3 bg-[#112415] border border-[#25D366]/40 rounded-lg text-xs text-[#B9F5C8]">{forgotMessage}</div><button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-2.5 rounded bg-[#181824] text-white text-xs font-semibold">Back to Login</button></div> : <form onSubmit={handleForgotPassword} className="space-y-4"><p className="text-xs text-[#9E9EAF]">Enter your registered delivery email address to receive a secure password reset link.</p><div><label className="text-[11px] text-[#C0C0D0] block mb-1">Your Email</label><input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="delivery@example.com" className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]" /></div>{forgotMessage && <p role="alert" className="text-xs text-[#FFBDBD]">{forgotMessage}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForgotModal(false)} className="px-3 py-2 rounded text-xs text-[#8A8A9C]">Cancel</button><button type="submit" disabled={forgotLoading} className="px-4 py-2 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold disabled:opacity-60">{forgotLoading ? 'Sending…' : 'Send Reset Link'}</button></div></form>}
          </div>
        </div>
      )}

      {showInviteModal && !isSupabaseConfigured && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E15] border border-[#2B2B3C] rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4"><div className="w-9 h-9 rounded-lg bg-[#181824] border border-[#2A2A38] flex items-center justify-center text-[#DFBA5A]"><Sparkles className="w-5 h-5" /></div><div><h3 className="font-luxury font-bold text-white text-base">Activate Demo Invitation</h3><p className="text-[11px] text-[#868698]">Local Demo Onboarding</p></div></div>
            {inviteSuccess ? <div className="space-y-4 py-4 text-center"><CheckCircle2 className="w-10 h-10 text-[#25D366] mx-auto" /><p className="text-xs text-[#B9F5C8] font-semibold">Demo account activated. Signing in…</p></div> : <form onSubmit={handleCompleteInvite} className="space-y-4"><div><label className="text-[11px] text-[#C0C0D0] block mb-1">Invitation Token</label><input required value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono" /></div><div><label className="text-[11px] text-[#C0C0D0] block mb-1">Create New Password</label><input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowInviteModal(false)} className="px-3 py-2 rounded text-xs text-[#8A8A9C]">Cancel</button><button type="submit" className="px-4 py-2 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold">Activate Demo Account</button></div></form>}
          </div>
        </div>
      )}
    </div>
  );
};
