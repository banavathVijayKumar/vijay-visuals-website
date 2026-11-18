import React, { useState } from 'react';
import { supabase, authService, UserProfile, UserRole } from '../../lib/supabase';
import { X, Lock, Mail, User, Phone } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  defaultRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess, defaultRole = 'customer' }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError('Secure sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the site environment, then redeploy.');
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: fullName.trim(), phone: phone.trim(), requested_role: defaultRole === 'shop_owner' ? 'shop_owner' : 'customer' } },
        });
        if (signUpError) throw signUpError;
        if (!data.session || !data.user) {
          setError('Registration received. Check your email to confirm your account, then sign in.');
          setIsRegister(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (signInError) throw signInError;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) throw new Error('Your secure session could not be created. Please sign in again.');

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('id', session.user.id)
        .single();
      if (profileError || !profileRow) {
        await supabase.auth.signOut();
        throw new Error('Your account profile could not be verified. Please contact support.');
      }
      const allowedRoles: UserRole[] = ['admin', 'shop_owner', 'delivery_boy', 'customer'];
      if (!allowedRoles.includes(profileRow.role as UserRole)) {
        await supabase.auth.signOut();
        throw new Error('Your account has an unsupported access role.');
      }
      if (isRegister && defaultRole === 'shop_owner' && profileRow.role !== 'shop_owner') {
        await supabase.auth.signOut();
        throw new Error('Shop Owner access was not assigned. Please contact support.');
      }
      const role = profileRow.role as UserRole;
      const profileName = String(profileRow.full_name || session.user.user_metadata?.full_name || fullName || 'Customer');

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

  return <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-xs">
      <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2A] mb-4">
        <div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] font-black">VV</span><div><h3 className="font-luxury font-bold text-white text-base">{isRegister ? 'Create Your Account' : 'Welcome Back'}</h3><p className="text-[11px] text-[#868698]">Secure Vijay Visuals account</p></div></div>
        <button onClick={onClose} className="p-1 text-[#848496] hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      {error && <div className="mb-4 p-3 rounded bg-[#2D1418] border border-[#E53E3E]/50 text-[#FFBDBD] text-xs">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        {isRegister && <>
          <label className="block text-[11px] text-[#B0B0C0]">Full Name<div className="relative mt-1"><User className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5"/><input required value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white" placeholder="Your name"/></div></label>
          <label className="block text-[11px] text-[#B0B0C0]">Mobile Number<div className="relative mt-1"><Phone className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5"/><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white" placeholder="+91 mobile number"/></div></label>
        </>}
        <label className="block text-[11px] text-[#B0B0C0]">Email Address<div className="relative mt-1"><Mail className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5"/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white" placeholder="you@domain.com"/></div></label>
        <label className="block text-[11px] text-[#B0B0C0]">Password<div className="relative mt-1"><Lock className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5"/><input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white" placeholder="At least 6 characters"/></div></label>
        <button disabled={busy} type="submit" className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider disabled:opacity-60">{busy ? 'Please wait…' : isRegister ? 'Create Secure Account' : 'Sign In'}</button>
      </form>
      <div className="mt-4 pt-3 border-t border-[#1C1C28] text-center text-[11px] text-[#8C8C9E]">{isRegister ? 'Already registered? ' : 'New to Vijay Visuals? '}<button onClick={()=>{setIsRegister(!isRegister);setError(null);}} className="text-[#DFBA5A] hover:underline font-bold">{isRegister ? 'Sign In' : 'Create Account'}</button></div>
      <p className="mt-3 text-[10px] text-center text-[#666678]">Admin access is assigned securely by the platform administrator. Choosing an admin role in the browser is not permitted.</p>
    </div>
  </div>;
};
