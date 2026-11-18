import React, { useEffect, useState } from 'react';

type PublishedData = {
  businessName: string;
  tagline?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  category?: string;
  template?: { name?: string; features?: string[] };
  themeColor?: string;
  language?: 'en' | 'te' | 'hi';
};

export const PublishedWebsite: React.FC<{ slug: string }> = ({ slug }) => {
  const [data, setData] = useState<PublishedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/sites/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Website not found.');
        return result.website as PublishedData;
      })
      .then((website) => { if (active) setData(website); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load this website.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const color = data?.themeColor || '#D4AF37';
  const wa = (data?.whatsapp || '').replace(/[^0-9]/g, '');
  const lang = data?.language || 'en';
  const labels = lang === 'te'
    ? { about: 'మా గురించి', services: 'మా సేవలు', contact: 'సంప్రదించండి', enquire: 'WhatsApp ద్వారా సంప్రదించండి' }
    : lang === 'hi'
      ? { about: 'हमारे बारे में', services: 'हमारी सेवाएँ', contact: 'संपर्क करें', enquire: 'WhatsApp पर पूछें' }
      : { about: 'About Us', services: 'Our Services', contact: 'Contact Us', enquire: 'Enquire on WhatsApp' };

  if (loading) return <main className="min-h-screen bg-[#09090d] text-white grid place-items-center"><p>Loading website…</p></main>;
  if (error || !data) return <main className="min-h-screen bg-[#09090d] text-white grid place-items-center p-6"><div className="max-w-lg text-center"><h1 className="text-2xl font-bold mb-3">Website unavailable</h1><p className="text-gray-400">{error || 'This website has not been published.'}</p><a className="inline-block mt-6 underline" href="/">VIJAY VISUALS Home</a></div></main>;

  return (
    <main className="min-h-screen bg-[#09090d] text-white" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
      <header className="border-b border-white/10 px-6 py-5"><div className="max-w-6xl mx-auto flex items-center justify-between gap-4"><a href="#top" className="font-bold tracking-wide text-lg">{data.businessName}</a><a href="#contact" className="rounded-full px-5 py-2 text-sm font-semibold text-black" style={{ backgroundColor: color }}>{labels.contact}</a></div></header>
      <section id="top" className="px-6 py-24 sm:py-32 text-center" style={{ background: `radial-gradient(ellipse at top, ${color}30, transparent 60%)` }}>
        <p className="uppercase tracking-[0.25em] text-xs mb-5" style={{ color }}>{data.category || 'Business'}</p>
        <h1 className="text-4xl sm:text-6xl font-bold max-w-4xl mx-auto leading-tight">{data.businessName}</h1>
        {data.tagline && <p className="text-lg sm:text-xl text-gray-300 mt-6 max-w-2xl mx-auto">{data.tagline}</p>}
        <div className="mt-9 flex flex-wrap justify-center gap-3"><a href="#services" className="rounded-lg px-6 py-3 font-semibold text-black" style={{ backgroundColor: color }}>{labels.services}</a>{wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I would like to know more about ${data.businessName}.`)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/20 px-6 py-3">{labels.enquire}</a>}</div>
      </section>
      <section className="px-6 py-16"><div className="max-w-5xl mx-auto grid sm:grid-cols-2 gap-10"><div><p className="text-xs uppercase tracking-widest mb-3" style={{ color }}>{labels.about}</p><h2 className="text-3xl font-bold">{data.businessName}</h2><p className="text-gray-400 mt-4">{data.tagline || `${data.businessName} — quality products and services for our customers.`}</p></div><div id="services"><p className="text-xs uppercase tracking-widest mb-3" style={{ color }}>{labels.services}</p><div className="grid gap-3">{(data.template?.features?.length ? data.template.features : ['Quality service', 'Customer support', 'Contact us for details']).map((feature, i) => <div key={`${feature}-${i}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">{feature}</div>)}</div></div></div></section>
      <section id="contact" className="px-6 py-16 bg-white/[0.03]"><div className="max-w-5xl mx-auto"><h2 className="text-3xl font-bold">{labels.contact}</h2><div className="mt-6 grid sm:grid-cols-2 gap-4 text-gray-300">{data.phone && <p>Phone: <a href={`tel:${data.phone}`} className="underline">{data.phone}</a></p>}{data.email && <p>Email: <a href={`mailto:${data.email}`} className="underline">{data.email}</a></p>}{data.address && <p>{data.address}</p>}{data.city && <p>{data.city}</p>}</div>{wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-block mt-8 rounded-lg px-6 py-3 font-bold text-black" style={{ backgroundColor: color }}>{labels.enquire}</a>}</div></section>
      <footer className="px-6 py-7 text-center text-xs text-gray-500">Powered by VIJAY VISUALS</footer>
    </main>
  );
};
