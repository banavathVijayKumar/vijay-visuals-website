import React, { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, MessageCircle, Headset, Bot, Package, CalendarCheck, PenTool, Clapperboard, ArrowUpRight, RefreshCw, UserRound, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Plan = { id: string; billingPeriod: 'monthly' | 'yearly' | 'one_time'; priceMinor: number | null; currency: string; usageLimit: number | null; features: string[] };
type Service = { id: string; slug: string; name: string; shortDescription: string; description: string; category: string; icon: string; demoEnabled: boolean; plans: Plan[] };
const iconMap: Record<string, React.ComponentType<any>> = {
  'message-circle': MessageCircle, headset: Headset, bot: Bot, package: Package,
  'calendar-check': CalendarCheck, 'pen-tool': PenTool, clapperboard: Clapperboard,
};
const formatPrice = (minor: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);

export function MarketplaceSection({ onOpenAuth }: { onOpenAuth: () => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Service | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [account, setAccount] = useState<any>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/marketplace/services', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Marketplace catalogue is not available yet.');
      setServices(Array.isArray(data.services) ? data.services : []);
    } catch (e: any) { setError(e?.message || 'Unable to load services.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openAccount = async () => {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) { onOpenAuth(); return; }
    setAccountLoading(true);
    try {
      const response = await fetch('/api/marketplace/account', { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Customer account is not available yet.');
      setAccount(payload);
    } catch (e: any) { setCheckoutMessage(e?.message || 'Unable to load your account.'); }
    finally { setAccountLoading(false); }
  };

  const buyPlan = async (plan: Plan) => {
    setCheckoutMessage('');
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) { setSelected(null); onOpenAuth(); return; }
    setBusyPlan(plan.id);
    try {
      const createResponse = await fetch('/api/marketplace/payments/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: plan.id }),
      });
      const order = await createResponse.json();
      if (!createResponse.ok) throw new Error(order?.error || 'Unable to create payment order.');
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(); script.onerror = () => reject(new Error('Razorpay Checkout could not load.'));
          document.body.appendChild(script);
        });
      }
      const checkout = new (window as any).Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency,
        name: 'VIJAY VISUALS', description: order.serviceName,
        order_id: order.razorpayOrderId,
        handler: async (payment: any) => {
          try {
            const verifyResponse = await fetch('/api/marketplace/payments/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ orderId: order.orderId, ...payment }),
            });
            const verified = await verifyResponse.json();
            if (!verifyResponse.ok || !verified.verified) throw new Error(verified?.error || 'Payment verification failed.');
            setCheckoutMessage('Payment verified. Your subscription is active.');
            setSelected(null);
            void openAccount();
          } catch (e: any) { setCheckoutMessage(e?.message || 'Payment verification failed. Please contact support with your payment reference.'); }
        },
        modal: { ondismiss: () => setCheckoutMessage('Payment window closed. No subscription was activated.') },
        theme: { color: '#D4AF37' },
      });
      checkout.open();
    } catch (e: any) { setCheckoutMessage(e?.message || 'Checkout is unavailable.'); }
    finally { setBusyPlan(null); }
  };

  const filtered = useMemo(() => services.filter((service) =>
    `${service.name} ${service.shortDescription} ${service.category}`.toLowerCase().includes(query.toLowerCase())), [services, query]);

  return <section id="ai-marketplace" className="py-24 bg-[#08080A] border-y border-[#24242E]">
    <div className="max-w-7xl mx-auto px-6">
      <div className="max-w-3xl mx-auto text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#E4C66B] text-[10px] uppercase tracking-[0.22em] font-bold mb-5"><Sparkles className="w-3.5 h-3.5"/> Vijay Visuals AI Marketplace</div>
        <h2 className="font-luxury text-3xl md:text-5xl font-bold text-white mb-4">AI Automation, <span className="text-[#D4AF37]">Ready for Business.</span></h2>
        <p className="text-sm md:text-base text-[#9292A2]">Explore business automation services. Published plans and prices are loaded directly from the marketplace database.</p>
      </div>
      <div className="max-w-xl mx-auto relative mb-10">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#858597]"/>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search AI services..." className="w-full rounded-xl bg-[#12121A] border border-[#30303C] focus:border-[#D4AF37] outline-none pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-[#777787]" />
      </div>
      {loading && <div className="text-center text-sm text-[#9B9BAA] py-12">Loading published AI services…</div>}
      {!loading && error && <div className="max-w-2xl mx-auto rounded-2xl border border-[#493C22] bg-[#17140D] p-6 text-center"><p className="text-sm text-[#E5D3A1] mb-4">{error}</p><button onClick={() => void load()} className="inline-flex items-center gap-2 text-xs font-bold text-[#E2C56D]"><RefreshCw className="w-3.5 h-3.5"/> Retry</button></div>}
      {!loading && !error && filtered.length === 0 && <div className="max-w-2xl mx-auto rounded-2xl border border-[#292936] bg-[#101018] p-8 text-center"><Sparkles className="w-7 h-7 text-[#D4AF37] mx-auto mb-3"/><h3 className="text-white font-semibold mb-2">{services.length ? 'No matching services' : 'Marketplace catalogue is being configured'}</h3><p className="text-xs leading-6 text-[#90909F]">{services.length ? 'Try another search term.' : 'AI services will appear here after an administrator publishes a service and sets its actual plan price. No sample prices are displayed.'}</p></div>}
      {!loading && filtered.length > 0 && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{filtered.map((service) => {
        const Icon = iconMap[service.icon] || Sparkles;
        return <article key={service.id} className="rounded-2xl border border-[#292936] bg-gradient-to-b from-[#14141D] to-[#0D0D13] p-6 flex flex-col hover:border-[#A98A3A]/70 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/25 flex items-center justify-center text-[#D4AF37] mb-5"><Icon className="w-5 h-5"/></div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#B99A4D] mb-2">{service.category}</div>
          <h3 className="text-lg font-bold text-white mb-2">{service.name}</h3>
          <p className="text-xs leading-6 text-[#9292A2] flex-1">{service.shortDescription}</p>
          <div className="mt-5 pt-4 border-t border-[#292936] flex items-center justify-between gap-3">
            <div className="text-xs text-[#A5A5B2]">{service.plans.length ? `${service.plans.length} published plan${service.plans.length > 1 ? 's' : ''}` : 'Plans not published'}</div>
            <button onClick={() => setSelected(service)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E0C46C] hover:text-white">View details <ArrowUpRight className="w-3.5 h-3.5"/></button>
          </div>
        </article>;
      })}</div>}
      {checkoutMessage && <div role="status" className="max-w-2xl mx-auto mt-6 rounded-xl border border-[#554522] bg-[#17140D] p-4 text-center text-xs text-[#E5D3A1]">{checkoutMessage}</div>}
      <div className="text-center mt-9 flex justify-center gap-3 flex-wrap"><button onClick={() => void openAccount()} disabled={accountLoading} className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-[#D4AF37]/50 text-[#E4C66B] text-xs font-bold"><UserRound className="w-4 h-4"/>{accountLoading ? 'Loading account…' : 'My Account'}</button><button onClick={onOpenAuth} className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#D8B650] to-[#A9852D] text-[#08080A] text-xs font-extrabold uppercase tracking-wider">Customer Sign In / Sign Up</button></div>
    </div>
    {account && <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAccount(null)}><div role="dialog" aria-modal="true" className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl border border-[#3A3527] bg-[#111119] p-6" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between mb-5"><div><div className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Customer Console</div><h3 className="text-xl font-bold text-white">My AI Services</h3><p className="text-xs text-[#9292A2]">{account.user?.email}</p></div><button onClick={()=>setAccount(null)} className="text-[#999]">✕</button></div><div className="grid md:grid-cols-2 gap-4"><div className="rounded-xl border border-[#30303C] p-4"><h4 className="text-white font-semibold mb-3">Subscriptions</h4>{account.subscriptions?.length ? account.subscriptions.map((item:any)=><div key={item.id} className="border-t border-[#292936] py-2 text-xs"><div className="text-white">{item.service_name}</div><div className="text-[#A6A6B3]">{item.billing_period} · {item.status}</div></div>) : <p className="text-xs text-[#8F8F9F]">No active subscriptions yet.</p>}</div><div className="rounded-xl border border-[#30303C] p-4"><h4 className="text-white font-semibold mb-3">Orders & Payments</h4>{account.orders?.length ? account.orders.map((item:any)=><div key={item.id} className="border-t border-[#292936] py-2 text-xs"><div className="text-white">{item.service_name}</div><div className="text-[#A6A6B3]">{item.currency} {(item.amount_minor/100).toFixed(2)} · {item.status}</div></div>) : <p className="text-xs text-[#8F8F9F]">No orders yet.</p>}</div></div><div className="rounded-xl border border-[#30303C] p-4 mt-4"><h4 className="text-white font-semibold mb-3">Recent AI Usage</h4>{account.usage?.length ? account.usage.map((item:any)=><div key={item.id} className="border-t border-[#292936] py-2 text-xs text-[#A6A6B3]">{item.provider} · {item.model} · {item.status}</div>) : <p className="text-xs text-[#8F8F9F]">No usage records yet.</p>}</div></div></div>}
    {selected && <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-[#3A3527] bg-[#111119] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4"><div><div className="text-[10px] uppercase tracking-widest text-[#D4AF37] mb-2">{selected.category}</div><h3 className="text-xl font-bold text-white">{selected.name}</h3></div><button onClick={() => setSelected(null)} className="text-[#999] hover:text-white" aria-label="Close">✕</button></div>
        <p className="text-sm leading-6 text-[#A5A5B2] mb-5">{selected.description}</p>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Available plans</h4>
        {selected.plans.length ? <div className="space-y-2">{selected.plans.map(plan => <div key={plan.id} className="rounded-lg border border-[#30303C] bg-[#171721] p-3 flex items-center justify-between gap-3"><div><div className="text-sm text-white capitalize">{plan.billingPeriod.replace('_', ' ')}</div><div className="text-[10px] text-[#9292A2]">{plan.usageLimit == null ? 'Usage limit not specified' : `${plan.usageLimit} uses`}</div></div><div className="text-right"><div className="text-sm font-bold text-[#E4C66B]">{plan.priceMinor == null ? 'Price not set' : formatPrice(plan.priceMinor, plan.currency)}</div><button disabled={busyPlan === plan.id || plan.priceMinor == null || plan.priceMinor <= 0} onClick={() => void buyPlan(plan)} className="mt-2 px-3 py-1.5 rounded bg-gradient-to-r from-[#D8B650] to-[#A9852D] text-[#08080A] text-[10px] font-bold disabled:opacity-40">{busyPlan === plan.id ? 'Preparing…' : 'Buy Now'}</button></div></div>)}</div> : <p className="text-xs text-[#A5A5B2] rounded-lg bg-[#171721] p-4">No active plans are published yet. Please check back later.</p>}
        <div className="mt-5 flex gap-3"><button onClick={() => { setSelected(null); onOpenAuth(); }} className="flex-1 py-3 rounded-lg bg-gradient-to-r from-[#D8B650] to-[#A9852D] text-[#08080A] text-xs font-bold">Sign in to continue</button><button onClick={() => setSelected(null)} className="px-4 py-3 rounded-lg border border-[#333340] text-xs text-[#B4B4C0]">Close</button></div>
      </div>
    </div>}
  </section>;
}
