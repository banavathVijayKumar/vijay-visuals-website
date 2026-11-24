export type Lang =
  | 'en'
  | 'te'
  | 'hi'
  | 'ta'
  | 'kn'
  | 'ml'
  | 'mr'
  | 'bn'
  | 'gu'
  | 'pa'
  | 'or'
  | 'ur';

export type CurrencyCode = 'INR' | 'USD' | 'GBP' | 'EUR' | 'AED';

export interface SupportedLanguageMeta {
  code: Lang;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguageMeta[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', dir: 'ltr' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', dir: 'ltr' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', dir: 'ltr' },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', dir: 'ltr' },
  { code: 'or', nativeName: 'ଓଡ଼ିଆ', englishName: 'Odia', dir: 'ltr' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl' },
] as const;

export const GLOBAL_CURRENCIES = [
  { code: 'INR' as const, symbol: '₹', label: 'INR (₹) — India' },
  { code: 'USD' as const, symbol: '$', label: 'USD ($) — Global' },
  { code: 'GBP' as const, symbol: '£', label: 'GBP (£) — UK' },
  { code: 'EUR' as const, symbol: '€', label: 'EUR (€) — Europe' },
  { code: 'AED' as const, symbol: 'AED', label: 'AED — UAE / Gulf' },
] as const;

export function formatMoneyFromInr(
  amountInr: number,
  currency: CurrencyCode,
  rates: Record<string, number> | null
): string {
  const safeAmount = Number.isFinite(amountInr) ? amountInr : 0;
  if (currency === 'INR' || !rates || !rates[currency] || rates[currency] <= 0) {
    return `₹${Math.round(safeAmount).toLocaleString('en-IN')}`;
  }
  const converted = safeAmount * rates[currency];
  const meta = GLOBAL_CURRENCIES.find((c) => c.code === currency);
  const symbol = meta?.symbol || currency;
  const formatted = converted >= 100 ? Math.round(converted).toLocaleString('en-US') : converted.toFixed(2);
  return currency === 'AED' ? `AED ${formatted}` : `${symbol}${formatted}`;
}

export const PLUGIN_CATALOG = [
  {
    code: 'google_analytics',
    name: 'Google Analytics 4 & Search Console',
    category: 'Analytics & SEO',
    permissionScope: 'read:traffic_metrics',
    pricing: 'Free Connector',
    description: 'Attach GA4 Measurement ID and Google Search Console verification tags to your storefront.',
  },
  {
    code: 'shiprocket_courier',
    name: 'Shiprocket / Delhivery Courier Sync',
    category: 'Shipping & Logistics',
    permissionScope: 'write:shipments,read:orders',
    pricing: 'Provider API Rates',
    description: 'Webhook bridge for real courier rate lookup, shipping labels, and AWB tracking updates.',
  },
  {
    code: 'whatsapp_cloud',
    name: 'WhatsApp Business Cloud API',
    category: 'Customer Messaging',
    permissionScope: 'send:consented_messages',
    pricing: 'Meta Per-Conversation Fee',
    description: 'Connect official Meta WhatsApp Business API credentials for consented order & delivery alerts.',
  },
  {
    code: 'tally_gst_export',
    name: 'Indian GST & Tally CSV Exporter',
    category: 'Finance & Accounting',
    permissionScope: 'read:invoices,read:finance',
    pricing: 'Included',
    description: 'Export GST-ready sales, credit notes, and expense ledgers for CA filing and reconciliation.',
  },
  {
    code: 'custom_webhook',
    name: 'Signed Outbound Webhook Endpoint',
    category: 'Developer API',
    permissionScope: 'events:orders,events:inventory',
    pricing: 'Included',
    description: 'Deliver signed JSON webhooks to your ERP or CRM without running untrusted third-party code.',
  },
] as const;

export const CONTACT_INFO = {
  name: 'VIJAY VISUALS',
  tagline: 'Made in India. Built for the World. Empowering Every Business to Go Digital.',
  phone: '+91 9381362201',
  mobile: '+91 9381362201',
  whatsappNumber: '919381362201',
  whatsappDisplay: '+91 93813 62201',
  email: 'vk66278@gmail.com',
  instagram: 'vijay_visuals_1',
  instagramUrl: 'https://instagram.com/vijay_visuals_1',
  whatsappUrl: 'https://wa.me/919381362201',
  location: 'Hyderabad, India · Serving Businesses Worldwide',
  experienceYears: '6+ Years',
  projectsCompleted: '150+',
  satisfactionRate: '99.8%',
};

export const BUSINESS_CATEGORIES = [
  { id: 'clothing', label: 'Clothing & Fashion', te: 'వస్త్రాలు & ఫ్యాషన్', hi: 'कपड़े और फैशन', defaultBanner: '/src/assets/images/store_fashion_royal_1795055802960.jpg' },
  { id: 'grocery', label: 'Grocery & Organics', te: 'కిరాణా & ఆర్గానిక్స్', hi: 'किराना और ऑर्गेनिक', defaultBanner: '/src/assets/images/store_grocery_organic_1795055803860.jpg' },
  { id: 'electronics', label: 'Electronics & Tech', te: 'ఎలక్ట్రానిక్స్ & టెక్', hi: 'इलेक्ट्रॉनिक्स और टेक', defaultBanner: '/src/assets/images/store_electronics_audio_1795055804216.jpg' },
  { id: 'restaurant', label: 'Restaurant & Cafes', te: 'రెస్టారెంట్ & కేఫ్స్', hi: 'रेस्टोरेंट और कैफे', defaultBanner: '/src/assets/images/store_gourmet_dining_1795055802368.jpg' },
  { id: 'hotel', label: 'Hotel & Hospitality', te: 'హోటల్ & ఆతిథ్యం', hi: 'होटल और हॉस्पिटैलिटी', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'photography', label: 'Photography Studios', te: 'ఫోటోగ్రఫీ & సినిమా', hi: 'फोटोग्राफी स्टूडियो', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'real_estate', label: 'Real Estate', te: 'రియల్ ఎస్టేట్', hi: 'रियल एस्टेट', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'education', label: 'Education & Coaching', te: 'విద్య & కోచింగ్', hi: 'शिक्षा और कोचिंग', defaultBanner: '/src/assets/images/store_electronics_audio_1795055804216.jpg' },
  { id: 'beauty_salon', label: 'Beauty Salon & Spa', te: 'బ్యూటీ సెలూన్ & స్పా', hi: 'ब्यूटी सैलून और स्पा', defaultBanner: '/src/assets/images/store_fashion_royal_1795055802960.jpg' },
  { id: 'gym', label: 'Gym & Fitness', te: 'జిమ్ & ఫిట్‌నెస్', hi: 'जिम और फिटनेस', defaultBanner: '/src/assets/images/store_electronics_audio_1795055804216.jpg' },
  { id: 'travel', label: 'Travel Agencies', te: 'ట్రావెల్ ఏజెన్సీలు', hi: 'ट्रैवल एजेंसी', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'automobile', label: 'Automobile & Motors', te: 'ఆటోమొబైల్ & మోటార్స్', hi: 'ऑटोमोबाइल और मोटर्स', defaultBanner: '/src/assets/images/store_electronics_audio_1795055804216.jpg' },
  { id: 'freelancer', label: 'Freelancers & Creators', te: 'ఫ్రీలాన్సర్లు & క్రియేటర్లు', hi: 'फ्रीलांसर और क्रिएटर्स', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'professional_services', label: 'Professional Services', te: 'ప్రొఫెషనల్ సేవలు', hi: 'प्रोफेशनल सेवाएं', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
  { id: 'wholesale', label: 'Wholesale & B2B Trade', te: 'హోల్‌సేల్ & B2B', hi: 'होलसेल और B2B व्यापार', defaultBanner: '/src/assets/images/store_grocery_organic_1795055803860.jpg' },
  { id: 'other', label: 'Other Business Categories', te: 'ఇతర వ్యాపారాలు', hi: 'अन्य व्यवसाय', defaultBanner: '/src/assets/images/hero_vijay_studio_1795055804014.jpg' },
] as const;

export const WEBSITE_TEMPLATES = [
  {
    id: 'obsidian-luxury',
    name: 'Obsidian Gold Luxury',
    desc: 'Deep charcoal canvas with metallic gold typography for boutiques, jewelry, and studios.',
    primaryColor: '#D4AF37',
    accentColor: '#0D0D12',
    fontFamily: 'Cinzel',
  },
  {
    id: 'slate-precision',
    name: 'Slate Precision Commerce',
    desc: 'Structured dark navy surfaces engineered for electronics, audio, and SaaS storefronts.',
    primaryColor: '#E5B94C',
    accentColor: '#0E131A',
    fontFamily: 'Plus Jakarta Sans',
  },
  {
    id: 'culinary-warm',
    name: 'Heritage Culinary Warmth',
    desc: 'Rich espresso backdrop with saffron gold accents tailored for restaurants & hotels.',
    primaryColor: '#D99B26',
    accentColor: '#16110D',
    fontFamily: 'Cinzel',
  },
  {
    id: 'botanical-modern',
    name: 'Botanical Organic Market',
    desc: 'Deep forest slate aesthetic designed for organic groceries, salons, and wellness brands.',
    primaryColor: '#C5A045',
    accentColor: '#101511',
    fontFamily: 'Plus Jakarta Sans',
  },
] as const;

export const SERVICES_DATA = [
  {
    id: 'web-platform',
    number: '01',
    title: 'AI Website Builder & Global E-Commerce Engine',
    shortDescription:
      'Launch mobile-responsive websites across 16 business categories with 12 Indian & global languages, live checkout, multi-currency FX, wholesale pricing, and GST invoices.',
    deliverables: [
      'Instant /site/your-brand URL, 12-language SEO metadata & custom domain DNS wizard',
      'Product variants, coupons, bulk wholesale pricing, wishlists & verified-purchase reviews',
      'Cashfree Platform Payments + segregated seller settlement ledger (automated split subject to Cashfree Easy Split activation) & COD reconciliation',
    ],
  },
  {
    id: 'delivery-ops',
    number: '02',
    title: 'CRM, Finance, Warehouses, HR & Delivery OS',
    shortDescription:
      'Dedicated role-based workspaces for business owners, staff, customers, and delivery partners with CRM leads, GST expenses, bookings, and fleet commissions.',
    deliverables: [
      'Delivery partner availability toggle, pickup-to-doorstep status & commissions',
      'CRM pipeline, loyalty points, consent-enforced messaging & appointment calendar',
      'Multi-warehouse & supplier directory, staff attendance & CSV finance export',
    ],
  },
  {
    id: 'ai-automation',
    number: '03',
    title: 'AI Automation Center & 12-Language Content Studio',
    shortDescription:
      'Gemini-powered customer support, website copy, SEO suggestions, product descriptions, business names, and approval-gated workflows across 12 languages.',
    deliverables: [
      '9 structured AI modes grounded strictly in your verified store metrics',
      'Trigger-condition-action workflows with manual approval & retry safety',
      'Metered AI credit tracking, history logs & declarative plugin connectors',
    ],
  },
  {
    id: 'cinema-pwa',
    number: '04',
    title: 'Optional Branded PWA & Creative Studio',
    shortDescription:
      'Keep website-only affordability or upgrade to an optional installable branded PWA alongside Vijay Visuals signature 4K wedding cinema and brand identity.',
    deliverables: [
      'Custom per-business Web App Manifest, icons & offline caching',
      'Server-verified optional PWA licensing (honestly labeled as Web App, not Play Store)',
      '4K multi-cam wedding film grading & luxury brand identity suites',
    ],
  },
];

export const PORTFOLIO_DATA = [
  {
    id: 'deccan-couture',
    title: 'Deccan Royal Couture Flagship',
    category: 'E-Commerce & Branded PWA',
    metric: '+165% Online Orders in 90 Days',
    client: 'Deccan Royal Couture, Hyderabad',
    summary:
      'Multi-variant bridal couture storefront with wholesale B2B pricing, live delivery tracking, and optional installable customer PWA.',
    image: '/src/assets/images/store_fashion_royal_1795055802960.jpg',
    slug: 'deccan-royal-couture',
  },
  {
    id: 'nocturne-audio',
    title: 'Nocturne Audio & Creator Hardware',
    category: 'Electronics Storefront & AI Center',
    metric: '42% Faster Support Resolution',
    client: 'Nocturne Audio Systems, HITEC City',
    summary:
      'Precision electronics catalog powered by Gemini AI customer support, low-stock inventory alerts, and automated GST invoice generation.',
    image: '/src/assets/images/store_electronics_audio_1795055804216.jpg',
    slug: 'nocturne-audio-tech',
  },
  {
    id: 'nizam-kitchen',
    title: 'Nizam Heritage Kitchen Direct',
    category: 'Restaurant Ordering & Delivery Fleet',
    metric: '35-Min Average Doorstep Delivery',
    client: 'Nizam Heritage Kitchen, Jubilee Hills',
    summary:
      'Zero-commission direct restaurant ordering with owner-controlled delivery partner assignment, thermal courier tracking, and coupon campaigns.',
    image: '/src/assets/images/store_gourmet_dining_1795055802368.jpg',
    slug: 'nizam-heritage-kitchen',
  },
];

export const TESTIMONIALS_DATA = [
  {
    id: 't-1',
    name: 'Rajesh Singhania',
    role: 'Founder & CEO',
    company: 'Singhania Real Estate & Landholdings',
    location: 'Hyderabad',
    quote:
      'Vijay transformed our digital presence completely. The black and gold aesthetic radiates authority, and our qualified client inquiries doubled within the first month.',
  },
  {
    id: 't-2',
    name: 'Dr. Priya & Rohit Verma',
    role: 'Bride & Groom',
    company: 'Udaipur Palace Wedding',
    location: 'Jaipur',
    quote:
      'Watching our wedding film edited by Vijay brought tears to our entire family. The color grading is pure royal cinema and every milestone was delivered on schedule.',
  },
  {
    id: 't-3',
    name: 'Anand Kumar',
    role: 'Managing Director',
    company: 'Kavya Botanicals & Luxury Skincare',
    location: 'Bengaluru',
    quote:
      'From our gold-foil brand identity to our fast e-commerce store and delivery tracking workflow, Vijay Visuals executed every detail with precision.',
  },
];

export const FAQS = [
  {
    q: 'Can I buy a website without the PWA add-on?',
    a: 'Yes. Website-only packages remain permanently available. The branded Progressive Web App (PWA) is strictly an optional paid add-on verified on the server.',
  },
  {
    q: 'How are Vijay Visuals platform payments separated from seller store sales?',
    a: 'Platform packages (websites, PWA, AI credits, storage) settle to the official Vijay Visuals Cashfree merchant account only after server-side HMAC signature verification. Business owner store sales are tracked in a segregated ledger, with automated vendor payouts subject to Cashfree Easy Split activation and approval.',
  },
  {
    q: 'Is the optional PWA a Google Play Store native app?',
    a: 'No. We never advertise a PWA as a Play Store native application. It is a modern, browser-installable Progressive Web App for supported Android Chrome and iOS Safari browsers with offline page caching and your custom icon.',
  },
  {
    q: 'Are third-party services like domain, WhatsApp API, or payment gateway free forever?',
    a: 'No. We transparently disclose all third-party charges: custom domain renewals, payment gateway transaction fees (Cashfree Payments), WhatsApp Business Cloud API messaging charges, and external cloud/email hosting are billed separately by their providers.',
  },
];

const EN_STRINGS: Record<string, string> = {
  navStudio: 'Studio',
  navBuilder: 'Builder',
  navMarketplace: 'Marketplace',
  navDashboards: 'Dashboards',
  navAi: 'AI Center',
  signIn: 'Sign In',
  signOut: 'Sign Out',
  heroKicker: 'VIJAY VISUALS · Made in India. Built for the World.',
  heroTitle: 'Empowering Every Business to Go Digital.',
  heroSubtitle:
    'Proudly built in India for entrepreneurs worldwide. Launch websites across 16 categories, full e-commerce, 12 languages, multi-currency display, custom domains, SEO tools, delivery ops, and Gemini AI automation.',
  ctaLaunchBuilder: 'Launch Website Builder',
  ctaExploreStores: 'Explore Live Stores',
  ctaWhatsApp: 'Start Project on WhatsApp',
  liveStoresTitle: 'Live Business Storefronts',
  liveStoresSubtitle:
    'Open any published multi-tenant storefront to test live shopping, service bookings, coupons, checkout, GST invoicing, and AI concierge.',
  pricingTitle: 'Transparent Packages & Global Licensing',
  pricingSubtitle:
    'Website-only stays affordable; add branded PWA, storage, or AI credits only when needed. Third-party infrastructure charges are clearly disclosed.',
  trackOrder: 'Track Order',
  openStore: 'Open Live Store',
  websiteOnly: 'Website Only',
  websitePlusPwa: 'Website + PWA',
};

export const I18N: Record<Lang, Record<string, string>> = {
  en: EN_STRINGS,
  te: {
    ...EN_STRINGS,
    navStudio: 'స్టూడియో',
    navBuilder: 'వెబ్ బిల్డర్',
    navMarketplace: 'మార్కెట్',
    navDashboards: 'డాష్‌బోర్డ్',
    navAi: 'AI సెంటర్',
    signIn: 'సైన్ ఇన్',
    signOut: 'సైన్ అవుట్',
    heroKicker: 'విజయ్ విజువల్స్ · భారతదేశంలో తయారైంది. ప్రపంచం కోసం నిర్మించబడింది.',
    heroTitle: 'ప్రతి వ్యాపారాన్ని డిజిటల్‌గా శక్తివంతం చేస్తోంది.',
    heroSubtitle:
      '16 వ్యాపార విభాగాల కోసం వెబ్‌సైట్ బిల్డర్, ఈ-కామర్స్, 12 భాషలు, మల్టీ-కరెన్సీ, కస్టమ్ డొమైన్, SEO టూల్స్, డెలివరీ మరియు Gemini AI ఆటోమేషన్.',
    ctaLaunchBuilder: 'వెబ్‌సైట్ బిల్డర్ తెరవండి',
    ctaExploreStores: 'లైవ్ స్టోర్స్ చూడండి',
    ctaWhatsApp: 'వాట్సాప్‌లో సంప్రదించండి',
    liveStoresTitle: 'లైవ్ బిజినెస్ స్టోర్‌ఫ్రంట్‌లు',
    liveStoresSubtitle: 'ఏదైనా స్టోర్ తెరిచి షాపింగ్, బుకింగ్స్, కూపన్లు, చెకౌట్, GST ఇన్‌వాయిస్ మరియు AI చాట్‌బాట్‌ను పరీక్షించండి.',
    pricingTitle: 'పారదర్శక ప్యాకేజీలు & లైసెన్సింగ్',
    pricingSubtitle: 'వెబ్‌సైట్ మాత్రమే తీసుకోవచ్చు లేదా అవసరమైనప్పుడు PWA, స్టోరేజ్, AI క్రెడిట్స్ జోడించవచ్చు.',
    trackOrder: 'ఆర్డర్ ట్రాక్ చేయండి',
    openStore: 'స్టోర్ తెరవండి',
    websiteOnly: 'వెబ్‌సైట్ మాత్రమే',
    websitePlusPwa: 'వెబ్‌సైట్ + PWA',
  },
  hi: {
    ...EN_STRINGS,
    navStudio: 'स्टूडियो',
    navBuilder: 'वेब बिल्डर',
    navMarketplace: 'मार्केटप्लेस',
    navDashboards: 'डैशबोर्ड',
    navAi: 'AI सेंटर',
    signIn: 'साइन इन',
    signOut: 'साइन आउट',
    heroKicker: 'विजय विजुअल्स · मेड इन इंडिया। विश्व के लिए निर्मित।',
    heroTitle: 'हर व्यवसाय को डिजिटल बनाने का सशक्त मंच।',
    heroSubtitle:
      '16 बिजनेस श्रेणियों के लिए AI वेबसाइट बिल्डर, ई-कॉमर्स, 12 भाषाएं, मल्टी-करेंसी, कस्टम डोमेन, SEO टूल्स, डिलीवरी मैनेजमेंट और वैकल्पिक ब्रांडेड PWA।',
    ctaLaunchBuilder: 'वेबसाइट बिल्डर खोलें',
    ctaExploreStores: 'लाइव स्टोर्स देखें',
    ctaWhatsApp: 'व्हाट्सएप पर शुरू करें',
    liveStoresTitle: 'लाइव बिजनेस स्टोरफ्रंट',
    liveStoresSubtitle: 'किसी भी स्टोर को खोलें और लाइव शॉपिंग, अपॉइंटमेंट बुकिंग, कूपन, चेकआउट, GST इनवॉइस और AI चैटबॉट टेस्ट करें।',
    pricingTitle: 'पारदर्शी पैकेज और लाइसेंसिंग',
    pricingSubtitle: 'केवल वेबसाइट पैकेज हमेशा उपलब्ध है; जरूरत होने पर ब्रांडेड PWA, स्टोरेज या AI क्रेडिट जोड़ें।',
    trackOrder: 'ऑर्डर ट्रैक करें',
    openStore: 'स्टोर खोलें',
    websiteOnly: 'केवल वेबसाइट',
    websitePlusPwa: 'वेबसाइट + PWA',
  },
  ta: {
    ...EN_STRINGS,
    navStudio: 'ஸ்டுடியோ',
    navBuilder: 'வலை உருவாக்கி',
    navMarketplace: 'சந்தை',
    navDashboards: 'டாஷ்போர்டு',
    navAi: 'AI மையம்',
    signIn: 'உள்நுழைக',
    signOut: 'வெளியேறு',
    heroKicker: 'விஜய் விஷுவல்ஸ் · இந்தியாவில் உருவானது. உலகிற்காக கட்டப்பட்டது.',
    heroTitle: 'ஒவ்வொரு வணிகத்தையும் டிஜிட்டல் மயமாக்குகிறது.',
    heroSubtitle:
      '16 வணிக பிரிவுகளுக்கான வலைத்தள உருவாக்கி, மின்-வணிகம், 12 மொழிகள், பல நாணய ஆதரவு, தனிப்பயன் டொமைன், SEO மற்றும் Gemini AI ஆட்டோமேஷன்.',
    ctaLaunchBuilder: 'வலை உருவாக்கியை திறக்கவும்',
    ctaExploreStores: 'நேரடி கடைகளை காண்க',
    ctaWhatsApp: 'வாட்ஸ்அப்பில் தொடங்கவும்',
    liveStoresTitle: 'நேரடி வணிக கடைகள்',
    pricingTitle: 'வெளிப்படையான திட்டங்கள்',
    trackOrder: 'ஆர்டர் நிலை',
    openStore: 'கடையை திறக்கவும்',
    websiteOnly: 'வலைத்தளம் மட்டும்',
    websitePlusPwa: 'வலைத்தளம் + PWA',
  },
  kn: {
    ...EN_STRINGS,
    navStudio: 'ಸ್ಟುಡಿಯೋ',
    navBuilder: 'ವೆಬ್ ಬಿಲ್ಡರ್',
    navMarketplace: 'ಮಾರುಕಟ್ಟೆ',
    navDashboards: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    navAi: 'AI ಕೇಂದ್ರ',
    signIn: 'ಸೈನ್ ಇನ್',
    signOut: 'ಸೈನ್ ಔಟ್',
    heroKicker: 'ವಿಜಯ್ ವಿಶುವಲ್ಸ್ · ಭಾರತದಲ್ಲಿ ತಯಾರಾಗಿದೆ. ಜಗತ್ತಿಗಾಗಿ ನಿರ್ಮಿಸಲಾಗಿದೆ.',
    heroTitle: 'ಪ್ರತಿ ವ್ಯವಹಾರವನ್ನು ಡಿಜಿಟಲ್ ಮಾಡಲು ಶಕ್ತಿ ನೀಡುತ್ತಿದೆ.',
    heroSubtitle:
      '16 ವ್ಯವಹಾರ ವಿಭಾಗಗಳಿಗೆ ವೆಬ್‌ಸೈಟ್ ಬಿಲ್ಡರ್, ಇ-ಕಾಮರ್ಸ್, 12 ಭಾಷೆಗಳು, ಮಲ್ಟಿ-ಕರೆನ್ಸಿ, ಕಸ್ಟಮ್ ಡೊಮೇನ್, SEO ಮತ್ತು Gemini AI ಆಟೋಮೇಷನ್.',
    ctaLaunchBuilder: 'ವೆಬ್‌ಸೈಟ್ ಬಿಲ್ಡರ್ ತೆರೆಯಿರಿ',
    ctaExploreStores: 'ಲೈವ್ ಸ್ಟೋರ್‌ಗಳನ್ನು ನೋಡಿ',
    ctaWhatsApp: 'ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಪ್ರಾರಂಭಿಸಿ',
    liveStoresTitle: 'ಲೈವ್ ಬ್ಯುಸಿನೆಸ್ ಸ್ಟೋರ್‌ಗಳು',
    pricingTitle: 'ಪಾರದರ್ಶಕ ಪ್ಯಾಕೇಜ್‌ಗಳು',
    trackOrder: 'ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ',
    openStore: 'ಸ್ಟೋರ್ ತೆರೆಯಿರಿ',
    websiteOnly: 'ವೆಬ್‌ಸೈಟ್ ಮಾತ್ರ',
    websitePlusPwa: 'ವೆಬ್‌ಸೈಟ್ + PWA',
  },
  ml: {
    ...EN_STRINGS,
    navStudio: 'സ്റ്റുഡിയോ',
    navBuilder: 'വെബ് ബിൽഡർ',
    navMarketplace: 'മാർക്കറ്റ്',
    navDashboards: 'ഡാഷ്ബോർഡ്',
    navAi: 'AI സെന്റർ',
    signIn: 'സൈൻ ഇൻ',
    signOut: 'സൈൻ ഔട്ട്',
    heroKicker: 'വിജയ് വിഷ്വൽസ് · ഇന്ത്യയിൽ നിർമ്മിച്ചത്. ലോകത്തിനായി ഒരുക്കിയത്.',
    heroTitle: 'എല്ലാ ബിസിനസ്സുകളെയും ഡിജിറ്റലാക്കാൻ ശക്തി നൽകുന്നു.',
    heroSubtitle:
      '16 ബിസിനസ്സ് വിഭാഗങ്ങൾക്കായി വെബ്സൈറ്റ് ബിൽഡർ, ഇ-കൊമേഴ്സ്, 12 ഭാഷകൾ, മൾട്ടി-കറൻസി, കസ്റ്റം ഡൊമെയ്ൻ, SEO, Gemini AI ഓട്ടോമേഷൻ.',
    ctaLaunchBuilder: 'വെബ്സൈറ്റ് ബിൽഡർ തുറക്കുക',
    ctaExploreStores: 'ലൈവ് സ്റ്റോറുകൾ കാണുക',
    ctaWhatsApp: 'വാട്സ്ആപ്പിൽ ആരംഭിക്കുക',
    liveStoresTitle: 'ലൈവ് ബിസിനസ്സ് സ്റ്റോറുകൾ',
    pricingTitle: 'സുതാര്യമായ പാക്കേജുകൾ',
    trackOrder: 'ഓർഡർ ട്രാക്ക് ചെയ്യുക',
    openStore: 'സ്റ്റോർ തുറക്കുക',
    websiteOnly: 'വെബ്സൈറ്റ് മാത്രം',
    websitePlusPwa: 'വെബ്സൈറ്റ് + PWA',
  },
  mr: {
    ...EN_STRINGS,
    navStudio: 'स्टुडिओ',
    navBuilder: 'वेब बिल्डर',
    navMarketplace: 'मार्केटप्लेस',
    navDashboards: 'डॅशबोर्ड',
    navAi: 'AI केंद्र',
    signIn: 'साइन इन',
    signOut: 'साइन आउट',
    heroKicker: 'विजय व्हिज्युअल्स · मेड इन इंडिया. जगासाठी निर्मित.',
    heroTitle: 'प्रत्येक व्यवसायाला डिजिटल बनवण्याची ताकद.',
    heroSubtitle:
      '16 व्यवसाय श्रेणींसाठी वेबसाइट बिल्डर, ई-कॉमर्स, 12 भाषा, मल्टी-करन्सी, कस्टम डोमेन, SEO टूल्स आणि Gemini AI ऑटोमेशन.',
    ctaLaunchBuilder: 'वेबसाइट बिल्डर उघडा',
    ctaExploreStores: 'लाइव्ह स्टोअर्स पहा',
    ctaWhatsApp: 'व्हॉट्सॲपवर सुरू करा',
    liveStoresTitle: 'लाइव्ह बिझनेस स्टोअर्स',
    pricingTitle: 'पारदर्शक पॅकेजेस',
    trackOrder: 'ऑर्डर ट्रॅक करा',
    openStore: 'स्टोअर उघडा',
    websiteOnly: 'फक्त वेबसाइट',
    websitePlusPwa: 'वेबसाइट + PWA',
  },
  bn: {
    ...EN_STRINGS,
    navStudio: 'স্টুডিও',
    navBuilder: 'ওয়েব বিল্ডার',
    navMarketplace: 'মার্কেটপ্লেস',
    navDashboards: 'ড্যাশবোর্ড',
    navAi: 'AI সেন্টার',
    signIn: 'সাইন ইন',
    signOut: 'সাইন আউট',
    heroKicker: 'বিজয় ভিজ্যুয়ালস · ভারতে তৈরি। বিশ্বের জন্য নির্মিত।',
    heroTitle: 'প্রতিটি ব্যবসাকে ডিজিটাল হতে সক্ষম করছে।',
    heroSubtitle:
      '১৬টি ব্যবসার বিভাগের জন্য ওয়েবসাইট বিল্ডার, ই-কমার্স, ১২টি ভাষা, মাল্টি-কারেন্সি, কাস্টম ডোমেইন, SEO এবং Gemini AI অটোমেশন।',
    ctaLaunchBuilder: 'ওয়েবসাইট বিল্ডার খুলুন',
    ctaExploreStores: 'লাইভ স্টোর দেখুন',
    ctaWhatsApp: 'হোয়াটসঅ্যাপে শুরু করুন',
    liveStoresTitle: 'লাইভ বিজনেস স্টোরফ্রন্ট',
    pricingTitle: 'স্বচ্ছ প্যাকেজ ও লাইসেন্সিং',
    trackOrder: 'অর্ডার ট্র্যাক করুন',
    openStore: 'স্টোর খুলুন',
    websiteOnly: 'শুধু ওয়েবসাইট',
    websitePlusPwa: 'ওয়েবসাইট + PWA',
  },
  gu: {
    ...EN_STRINGS,
    navStudio: 'સ્ટુડિયો',
    navBuilder: 'વેબ બિલ્ડર',
    navMarketplace: 'માર્કેટપ્લેસ',
    navDashboards: 'ડેશબોર્ડ',
    navAi: 'AI સેન્ટર',
    signIn: 'સાઇન ઇન',
    signOut: 'સાઇન આઉટ',
    heroKicker: 'વિજય વિઝ્યુઅલ્સ · ભારતમાં નિર્મિત. વિશ્વ માટે બનાવેલ.',
    heroTitle: 'દરેક વ્યવસાયને ડિજિટલ બનાવવાની શક્તિ.',
    heroSubtitle:
      '16 વ્યવસાય શ્રેણીઓ માટે વેબસાઇટ બિલ્ડર, ઈ-કોમર્સ, 12 ભાષાઓ, મલ્ટી-કરન્સી, કસ્ટમ ડોમેન, SEO અને Gemini AI ઓટોમેશન.',
    ctaLaunchBuilder: 'વેબસાઇટ બિલ્ડર ખોલો',
    ctaExploreStores: 'લાઇવ સ્ટોર્સ જુઓ',
    ctaWhatsApp: 'વોટ્સએપ પર શરૂ કરો',
    liveStoresTitle: 'લાઇવ બિઝનેસ સ્ટોર્સ',
    pricingTitle: 'પારદર્શક પેકેજો',
    trackOrder: 'ઓર્ડર ટ્રેક કરો',
    openStore: 'સ્ટોર ખોલો',
    websiteOnly: 'માત્ર વેબસાઇટ',
    websitePlusPwa: 'વેબસાઇટ + PWA',
  },
  pa: {
    ...EN_STRINGS,
    navStudio: 'ਸਟੂਡੀਓ',
    navBuilder: 'ਵੈੱਬ ਬਿਲਡਰ',
    navMarketplace: 'ਮਾਰਕੀਟਪਲੇਸ',
    navDashboards: 'ਡੈਸ਼ਬੋਰਡ',
    navAi: 'AI ਸੈਂਟਰ',
    signIn: 'ਸਾਈਨ ਇਨ',
    signOut: 'ਸਾਈਨ ਆਉਟ',
    heroKicker: 'ਵਿਜੇ ਵਿਜ਼ੁਅਲਸ · ਭਾਰਤ ਵਿੱਚ ਬਣਿਆ। ਦੁਨੀਆ ਲਈ ਤਿਆਰ।',
    heroTitle: 'ਹਰ ਕਾਰੋਬਾਰ ਨੂੰ ਡਿਜੀਟਲ ਬਣਾਉਣ ਦਾ ਪਲੇਟਫਾਰਮ।',
    heroSubtitle:
      '16 ਕਾਰੋਬਾਰੀ ਸ਼੍ਰੇਣੀਆਂ ਲਈ ਵੈੱਬਸਾਈਟ ਬਿਲਡਰ, ਈ-ਕਾਮਰਸ, 12 ਭਾਸ਼ਾਵਾਂ, ਮਲਟੀ-ਕਰੰਸੀ, ਕਸਟਮ ਡੋਮੇਨ, SEO ਅਤੇ Gemini AI ਆਟੋਮੇਸ਼ਨ।',
    ctaLaunchBuilder: 'ਵੈੱਬਸਾਈਟ ਬਿਲਡਰ ਖੋਲ੍ਹੋ',
    ctaExploreStores: 'ਲਾਈਵ ਸਟੋਰ ਦੇਖੋ',
    ctaWhatsApp: 'ਵਟਸਐਪ ’ਤੇ ਸ਼ੁਰੂ ਕਰੋ',
    liveStoresTitle: 'ਲਾਈਵ ਬਿਜ਼ਨਸ ਸਟੋਰ',
    pricingTitle: 'ਪਾਰਦਰਸ਼ੀ ਪੈਕੇਜ',
    trackOrder: 'ਆਰਡਰ ਟ੍ਰੈਕ ਕਰੋ',
    openStore: 'ਸਟੋਰ ਖੋਲ੍ਹੋ',
    websiteOnly: 'ਸਿਰਫ਼ ਵੈੱਬਸਾਈਟ',
    websitePlusPwa: 'ਵੈੱਬਸਾਈਟ + PWA',
  },
  or: {
    ...EN_STRINGS,
    navStudio: 'ଷ୍ଟୁଡିଓ',
    navBuilder: 'ୱେବ୍ ବିଲ୍ଡର୍',
    navMarketplace: 'ମାର୍କେଟପ୍ଲେସ୍',
    navDashboards: 'ଡ୍ୟାସବୋର୍ଡ',
    navAi: 'AI ସେଣ୍ଟର',
    signIn: 'ସାଇନ୍ ଇନ୍',
    signOut: 'ସାଇନ୍ ଆଉଟ୍',
    heroKicker: 'ବିଜୟ ଭିଜୁଆଲ୍ସ · ଭାରତରେ ନିର୍ମିତ। ବିଶ୍ୱ ପାଇଁ ଗଠିତ।',
    heroTitle: 'ପ୍ରତ୍ୟେକ ବ୍ୟବସାୟକୁ ଡିଜିଟାଲ୍ କରିବା ପାଇଁ ସଶକ୍ତ ପ୍ଲାଟଫର୍ମ।',
    heroSubtitle:
      '16 ବ୍ୟବସାୟ ଶ୍ରେଣୀ ପାଇଁ ୱେବସାଇଟ୍ ବିଲ୍ଡର୍, ଇ-କମର୍ସ, 12 ଭାଷା, ମଲ୍ଟି-କରେନ୍ସି, କଷ୍ଟମ୍ ଡୋମେନ୍, SEO ଏବଂ Gemini AI ଅଟୋମେସନ୍।',
    ctaLaunchBuilder: 'ୱେବସାଇଟ୍ ବିଲ୍ଡର୍ ଖୋଲନ୍ତୁ',
    ctaExploreStores: 'ଲାଇଭ୍ ଷ୍ଟୋର୍ ଦେଖନ୍ତୁ',
    ctaWhatsApp: 'ହ୍ୱାଟସଆପରେ ଆରମ୍ଭ କରନ୍ତୁ',
    liveStoresTitle: 'ଲାଇଭ୍ ବ୍ୟବସାୟ ଷ୍ଟୋରଫ୍ରଣ୍ଟ',
    pricingTitle: 'ସ୍ୱଚ୍ଛ ପ୍ୟାକେଜ୍',
    trackOrder: 'ଅର୍ଡର ଟ୍ରାକ୍ କରନ୍ତୁ',
    openStore: 'ଷ୍ଟୋର୍ ଖୋଲନ୍ତୁ',
    websiteOnly: 'କେବଳ ୱେବସାଇଟ୍',
    websitePlusPwa: 'ୱେବସାଇଟ୍ + PWA',
  },
  ur: {
    ...EN_STRINGS,
    navStudio: 'اسٹوڈیو',
    navBuilder: 'ویب بلڈر',
    navMarketplace: 'مارکیٹ پلیس',
    navDashboards: 'ڈیش بورڈ',
    navAi: 'AI سینٹر',
    signIn: 'سائن ان',
    signOut: 'سائن آؤٹ',
    heroKicker: 'وجے ویژولز · بھارت میں تیار کردہ۔ دنیا کے لیے بنایا گیا۔',
    heroTitle: 'ہر کاروبار کو ڈیجیٹل بنانے کا مضبوط پلیٹ فارم۔',
    heroSubtitle:
      '16 کاروباری شعبوں کے لیے ویب سائٹ بلڈر، ای کامرس، 12 زبانیں، ملٹی کرنسی، کسٹم ڈومین، SEO ٹولز اور Gemini AI آٹومیشن۔',
    ctaLaunchBuilder: 'ویب سائٹ بلڈر کھولیں',
    ctaExploreStores: 'لائیو اسٹورز دیکھیں',
    ctaWhatsApp: 'واٹس ایپ پر شروع کریں',
    liveStoresTitle: 'لائیو بزنس اسٹور فرنٹس',
    pricingTitle: 'شفاف پیکجز اور لائسنسنگ',
    trackOrder: 'آرڈر ٹریک کریں',
    openStore: 'اسٹور کھولیں',
    websiteOnly: 'صرف ویب سائٹ',
    websitePlusPwa: 'ویب سائٹ + PWA',
  },
};

export function getI18n(lang: Lang): Record<string, string> {
  return I18N[lang] || I18N.en;
}
