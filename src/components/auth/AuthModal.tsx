import React, { useState } from 'react';
import { authService, UserProfile, UserRole } from '../../lib/supabase';
import { X, Lock, Mail, User, Phone, Store, ArrowRight, ShieldCheck, Check } from 'lucide-react';

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
  defaultRole = 'customer',
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      // Simulate/register user profile
      const newUser: UserProfile = {
        id: 'usr-' + Date.now().toString(36),
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || 'New User',
        phone: phone.trim() || '+91 98765 43210',
        role: role,
        status: 'active',
        created_at: new Date().toISOString(),
      };
      onSuccess(newUser);
      onClose();
    } else {
      const res = authService.login(email, password, role === 'admin' ? 'admin' : undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.user) {
        onSuccess(res.user);
        onClose();
      }
    }
  };

  const handleQuickFill = (targetEmail: string, targetRole: UserRole) => {
    setEmail(targetEmail);
    setPassword('Pass@123');
    setRole(targetRole);
    setIsRegister(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in duration-150 text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2A] mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black">
              VV
            </span>
            <div>
              <h3 className="font-luxury font-bold text-white text-base">
                {isRegister ? 'Create Your Account' : 'Welcome Back'}
              </h3>
              <p className="text-[11px] text-[#868698]">
                Vijay Visuals Multi-Tenant Platform
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-[#848496] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-2.5 rounded bg-[#2D1418] border border-[#E53E3E]/50 text-[#FFBDBD] text-xs">
            {error}
          </div>
        )}

        {/* Role Selector */}
        <div className="mb-4">
          <label className="text-[11px] text-[#A0A0B2] block mb-1.5 font-medium">Select Account Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'customer', label: 'Customer' },
              { id: 'shop_owner', label: 'Shop Owner' },
              { id: 'admin', label: 'Super Admin' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id as any)}
                className={`py-2 px-1 rounded-lg border text-center transition-colors ${
                  role === r.id
                    ? 'bg-[#181826] border-[#DFBA5A] text-[#DFBA5A] font-bold'
                    : 'bg-[#12121A] border-[#20202E] text-[#828294]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <>
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikramaditya Rao"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                  />
                  <User className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Mobile Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="+91 93813 62201"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                  />
                  <Phone className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-[11px] text-[#B0B0C0] block mb-1">Email Address</label>
            <div className="relative">
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
              />
              <Mail className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#B0B0C0] block mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
              />
              <Lock className="w-3.5 h-3.5 text-[#606072] absolute left-2.5 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
          >
            {isRegister ? 'Complete Registration' : 'Sign In'}
          </button>
        </form>

        {/* Switch between Login and Register */}
        <div className="mt-4 pt-3 border-t border-[#1C1C28] text-center text-[11px] text-[#8C8C9E]">
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button onClick={() => setIsRegister(false)} className="text-[#DFBA5A] hover:underline font-bold">
                Log In
              </button>
            </span>
          ) : (
            <span>
              New to Vijay Visuals?{' '}
              <button onClick={() => setIsRegister(true)} className="text-[#DFBA5A] hover:underline font-bold">
                Create Account
              </button>
            </span>
          )}
        </div>

        {/* Quick Demo Logins for Instant Testing */}
        <div className="mt-4 pt-3 border-t border-[#1C1C28] space-y-1.5">
          <span className="text-[10px] font-mono text-[#6A6A7C] uppercase block text-center">
            Instant Demo Sign-In
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill('admin@vijayvisuals.com', 'admin')}
              className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]"
            >
              Admin Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('vikram@aurajewels.com', 'shop_owner')}
              className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]"
            >
              Shop Owner Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('rahul@gmail.com', 'customer')}
              className="flex-1 p-1.5 rounded bg-[#13131E] border border-[#20202E] text-[10px] text-white hover:text-[#DFBA5A]"
            >
              Customer Demo
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
