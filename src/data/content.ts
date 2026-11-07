export interface ServiceItem {
  id: string;
  number: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  deliverables: string[];
  techStack: string[];
  idealFor: string;
  badge: string;
  startingPrice: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  category: 'web' | 'ecommerce' | 'video' | 'graphics';
  categoryLabel: string;
  tagline: string;
  description: string;
  challenge: string;
  solution: string;
  results: string[];
  client: string;
  year: string;
  deliverables: string[];
  toolsUsed: string[];
  featured: boolean;
  accentColor: string;
  type: 'web-showcase' | 'video-showcase' | 'graphic-showcase';
  mockupData?: {
    pages?: string[];
    statMetric?: string;
    statLabel?: string;
    videoDuration?: string;
    videoResolution?: string;
  };
}

export interface PricingPlan {
  id: string;
  name: string;
  tagline: string;
  price: string;
  billingCycle: string;
  popular?: boolean;
  features: string[];
  turnaround: string;
  serviceCategory: 'web' | 'video' | 'graphics';
  whatsappMessage: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  companyOrEvent: string;
  serviceUsed: string;
  quote: string;
  rating: number;
  location: string;
}

export const CONTACT_INFO = {
  name: 'Vijay Visuals',
  tagline: 'High-End Web Development & Cinematic Visual Craft',
  whatsappNumber: '919381362201',
  whatsappDisplay: '+91 93813 62201',
  email: 'vk66278@gmail.com',
  instagram: 'vijay_visuals_1',
  instagramUrl: 'https://instagram.com/vijay_visuals_1',
  whatsappUrl: 'https://wa.me/919381362201',
  location: 'Hyderabad & Global Client Delivery',
  experienceYears: '6+ Years',
  projectsCompleted: '150+',
  satisfactionRate: '99.8%',
};

export const SERVICES_DATA: ServiceItem[] = [
  {
    id: 'web-development',
    number: '01',
    title: 'Website Development',
    shortDescription: 'Custom, high-performance web applications built with modern frameworks, lightning-fast speed, and bespoke animations.',
    fullDescription: 'We engineer tailor-made, responsive web experiences with immaculate front-end architecture. From interactive single-page applications to robust multi-page corporate portals, every line of code is optimized for extreme performance, search engine dominance, and seamless cross-device fidelity.',
    deliverables: [
      'Tailored modern architecture (React, TypeScript, Tailwind)',
      'Sub-second page load times with 95+ Google PageSpeed score',
      'Fluid micro-interactions & bespoke motion animations',
      'Technical SEO architecture & social preview meta optimization',
      'Mobile-first responsive layout tested across 20+ viewports',
      'Contact forms with automated WhatsApp & email alerts'
    ],
    techStack: ['React', 'TypeScript', 'Tailwind CSS', 'Vite', 'Node.js', 'Next.js'],
    idealFor: 'Forward-thinking founders, modern brands, and ambitious enterprises demanding distinctive digital presence.',
    badge: 'Core Specialty',
    startingPrice: 'Custom Quote',
  },
  {
    id: 'ecommerce-websites',
    number: '02',
    title: 'E-commerce Websites',
    shortDescription: 'Conversion-engineered online flagship stores with frictionless checkout, payment gateways, and inventory control.',
    fullDescription: 'Transform browsers into lifelong customers with luxury e-commerce platforms engineered for revenue. We craft ultra-smooth product discovery experiences, dynamic cart drawers, instant UPI and credit card checkout flows, and automated order confirmation notifications.',
    deliverables: [
      'Custom high-conversion storefront & product showcase pages',
      'Frictionless checkout with Razorpay, Stripe & instant UPI integrations',
      'Inventory, variant & real-time stock management systems',
      'WhatsApp order confirmation & automated customer tracking',
      'Abandoned cart recovery hooks & promotional banner engines',
      'Comprehensive customer dashboard & order history interface'
    ],
    techStack: ['Shopify Liquid', 'WooCommerce', 'React Commerce', 'Razorpay', 'Stripe', 'Tailwind'],
    idealFor: 'D2C apparel brands, luxury jewelry, boutique craft creators, and fast-scaling retail operations.',
    badge: 'High Conversion',
    startingPrice: 'Custom Quote',
  },
  {
    id: 'business-websites',
    number: '03',
    title: 'Business Websites',
    shortDescription: 'Executive corporate websites that establish commanding market authority, trust, and qualified inbound leads.',
    fullDescription: 'Position your business as the undisputed leader in your industry. Our corporate websites weave your firm’s value proposition, case studies, client proof, and executive leadership into an authoritative digital showroom designed to capture enterprise deals.',
    deliverables: [
      'Commanding executive homepage with clear value hierarchy',
      'Case study showrooms & interactive client proof vaults',
      'Team leadership bios, credentials & media coverage sections',
      'Interactive service quote estimators & lead capture funnels',
      'Compliant legal architectures (Privacy Policy, Terms, Disclaimers)',
      'Direct WhatsApp inquiry floating desk & CRM webhook hooks'
    ],
    techStack: ['React', 'Tailwind CSS', 'PostgreSQL / Cloud DB', 'Framer Motion', 'Express'],
    idealFor: 'Consulting firms, legal practices, real estate brokers, industrial leaders, and medical clinics.',
    badge: 'Corporate Authority',
    startingPrice: 'Custom Quote',
  },
  {
    id: 'wedding-video-editing',
    number: '04',
    title: 'Wedding Video Editing',
    shortDescription: 'Cinematic storytelling, royal color grading, and emotional rhythm that immortalize once-in-a-lifetime moments.',
    fullDescription: 'Wedding cinema requires more than cutting clips—it demands emotional intuition and Hollywood-caliber color science. We transform raw footage from luxury weddings into breathtaking 4K cinematic teasers, emotional highlight films, and comprehensive multi-camera ceremony features.',
    deliverables: [
      'Signature cinematic color grading (warm gold & film-print emulation)',
      'Multi-camera ceremony & reception footage synchronization',
      'Bespoke cinematic sound design, licensed orchestral & acoustic scores',
      '4K 60FPS Ultra-HD master delivery & compressed mobile reels (9:16)',
      'Cinematic trailer cuts (60-90s) & full documentary edits (15-45m)',
      'Drone aerial footage stabilization & audio speech enhancement'
    ],
    techStack: ['DaVinci Resolve Studio', 'Adobe Premiere Pro', 'After Effects', 'iZotope RX Audio', 'Color Grading LUTs'],
    idealFor: 'Wedding cinematographers, studios, couples, and luxury destination wedding organizers.',
    badge: 'Signature Craft',
    startingPrice: 'Custom Quote',
  },
  {
    id: 'graphic-design',
    number: '05',
    title: 'Graphic Design',
    shortDescription: 'Luxury brand identities, gold-foil logos, packaging systems, and bespoke marketing collateral.',
    fullDescription: 'Visual distinction is your ultimate competitive moat. We build cohesive brand identity systems from timeless logos and typography guidelines to gold-embossed stationery, premium product packaging, social media master kits, and billboard-ready advertising.',
    deliverables: [
      'Comprehensive logo suite (Primary mark, monogram, favicon, vector SVG)',
      'Complete luxury brand guidelines (Typography, palette, spatial rules)',
      'Print-ready stationery (Gold foil business cards, letterheads, envelopes)',
      'High-impact social media marketing templates & carousel systems',
      'Product packaging, label designs & luxury unboxing aesthetics',
      'Brochures, pitch deck presentations & commercial hoardings'
    ],
    techStack: ['Adobe Illustrator', 'Photoshop', 'Figma', 'InDesign', 'Cinema 4D'],
    idealFor: 'Luxury startups, hospitality venues, wedding planners, retail brands, and personal influencers.',
    badge: 'Brand Identity',
    startingPrice: 'Custom Quote',
  },
];

export const PORTFOLIO_DATA: PortfolioItem[] = [
  {
    id: 'aura-joaillerie',
    title: 'Aura Haute Joaillerie',
    category: 'ecommerce',
    categoryLabel: 'E-commerce & Web Development',
    tagline: 'Flagship digital atelier for an exclusive diamond & gold jewelry house.',
    description: 'Engineered a dark obsidian storefront with custom 360-degree gem visualization, instant WhatsApp jewelry concierge booking, and seamless Razorpay/UPI checkout.',
    challenge: 'The client needed an online presence matching the tactile exclusivity of their high-end private showroom, without slow loading times on mobile devices.',
    solution: 'Built a lightweight React SPA with GPU-accelerated micro-interactions, responsive image pyramids, and a dedicated bridal appointment booking modal.',
    results: [
      '3.4x Increase in online private consultation bookings',
      '0.8s Average mobile page load speed',
      '+210% Higher mobile checkout completion rate'
    ],
    client: 'Aura Jewels International',
    year: '2026',
    deliverables: ['Custom E-Commerce Storefront', '360° Diamond Viewer', 'WhatsApp Concierge Desk', 'Razorpay Integration'],
    toolsUsed: ['React', 'TypeScript', 'Tailwind CSS', 'Razorpay API', 'Framer Motion'],
    featured: true,
    accentColor: '#D4AF37',
    type: 'web-showcase',
    mockupData: {
      statMetric: '+210%',
      statLabel: 'Conversion Uplift',
      pages: ['Atelier Home', 'High Jewelry Collection', 'Bespoke Ring Builder', 'Private Viewing Vault']
    }
  },
  {
    id: 'rajputana-grandeur',
    title: 'The Royal Union: Samar & Meera',
    category: 'video',
    categoryLabel: 'Wedding Video Editing',
    tagline: 'A 4K royal palace cinematic film captured across 3 days in Udaipur.',
    description: 'Multicam documentary editing with bespoke royal warm-gold color grading, synchronized live sitar and orchestral score, and tear-jerking vows pacing.',
    challenge: 'Over 850GB of raw multi-camera Sony FX3 and drone log footage from a 3-day royal palace celebration required meticulous color-matching and narrative pacing.',
    solution: 'Crafted a 90-second theatrical teaser, a 5-minute cinematic highlight reel, and a 38-minute full documentary edit with speech noise-reduction and custom LUTs.',
    results: [
      '1.2M+ Organic views across Instagram Reels & YouTube',
      'Featured in Luxury Weddings International Review',
      'Delivered in pristine 4K HDR & calibrated REC.709 masters'
    ],
    client: 'Royal Rajasthan Weddings',
    year: '2026',
    deliverables: ['90s Cinematic Teaser', '5m Highlight Reel', '38m Full Documentary Film', 'Vertical 9:16 Instagram Cut'],
    toolsUsed: ['DaVinci Resolve Studio', 'Adobe Premiere Pro', 'FilmConvert Pro', 'iZotope RX'],
    featured: true,
    accentColor: '#DFBA5A',
    type: 'video-showcase',
    mockupData: {
      videoDuration: '04:48',
      videoResolution: '4K Ultra HD (3840x2160) 60fps'
    }
  },
  {
    id: 'vanguard-ventures',
    title: 'Vanguard Capital Partners',
    category: 'web',
    categoryLabel: 'Business Website',
    tagline: 'Executive website for a premier cross-border venture capital firm.',
    description: 'Minimalist editorial interface presenting investment theses, active portfolio companies, founder testimonials, and an interactive pitch deck submission portal.',
    challenge: 'The firm needed to radiate institutional authority while appealing to next-generation tech founders seeking seed-to-series B capital.',
    solution: 'Implemented a bespoke dark-mode interface with sharp typography, interactive portfolio filter grids, and end-to-end encrypted founder submission workflows.',
    results: [
      'Zero downtime across major fund announcement traffic spikes',
      'Over $45M in prospective deal flow inquiries filtered',
      '100/100 Desktop Google Lighthouse performance score'
    ],
    client: 'Vanguard Ventures LLC',
    year: '2026',
    deliverables: ['Executive Business Portal', 'Portfolio Filter Matrix', 'Founder Pitch Desk', 'Investor Relations Hub'],
    toolsUsed: ['React', 'TypeScript', 'Tailwind CSS', 'Vite', 'Node.js'],
    featured: true,
    accentColor: '#D8AF44',
    type: 'web-showcase',
    mockupData: {
      statMetric: '100/100',
      statLabel: 'Lighthouse Score',
      pages: ['Executive Overview', 'Investment Thesis', 'Portfolio Matrix', 'Founder Inquiries']
    }
  },
  {
    id: 'kavya-botanicals',
    title: 'Kavya Organics & Botanicals',
    category: 'graphics',
    categoryLabel: 'Graphic Design & Brand Identity',
    tagline: 'Luxury botanical skincare identity with gold foil embossing & minimalist packaging.',
    description: 'Designed the complete brand mark, luxury typographic guidelines, embossed glass bottle packaging, and social media aesthetic manual.',
    challenge: 'Differentiating an ayurvedic botanical beauty brand in an oversaturated market through an unmistakable high-end apothecary visual identity.',
    solution: 'Created custom gold-embossed geometric insignia, sustainable kraft box vector dies, and an editorial social media launch grid that drove instant pre-orders.',
    results: [
      'First production batch completely sold out within 14 days',
      'Packaging featured in Asian Design Annual 2026',
      'Complete vector master files delivered for global manufacturing'
    ],
    client: 'Kavya Botanicals Pvt Ltd',
    year: '2026',
    deliverables: ['Complete Brand Guidelines Book', 'Embossed Gold Foil Logo Suite', 'Product Packaging Dies', 'Social Media Grid Kit'],
    toolsUsed: ['Adobe Illustrator', 'Photoshop', 'InDesign', '3D Packaging Mockup Engine'],
    featured: false,
    accentColor: '#ECC86A',
    type: 'graphic-showcase',
    mockupData: {
      statMetric: 'Sold Out',
      statLabel: 'Batch 01 Debut',
    }
  },
  {
    id: 'golden-knot-wedding',
    title: 'The Golden Knot: Ananya & Siddharth',
    category: 'video',
    categoryLabel: 'Wedding Video Editing',
    tagline: 'Intimate beachside sunset wedding film with acoustic melodies & cinematic pacing.',
    description: 'Subtle warm film grain, color grading calibrated for golden hour ocean light, drone stabilization, and heartfelt vows montage.',
    challenge: 'High wind noise during the outdoor beach vows and rapidly shifting twilight lighting.',
    solution: 'Advanced spectral audio de-noising combined with frame-by-frame color tracking to maintain glowing skin tones against the vibrant ocean sunset.',
    results: [
      'Delivered within 7 days for the couple’s reception screening',
      'Praise from family across 4 continents',
      '100% 5-star review rating from the couple'
    ],
    client: 'Private Couple Commission',
    year: '2026',
    deliverables: ['60s Sunset Teaser', '8m Featurette', 'Raw Multi-Cam Speeches Sync'],
    toolsUsed: ['DaVinci Resolve Studio', 'iZotope RX', 'FilmConvert', 'Sony S-Log3 Profiles'],
    featured: false,
    accentColor: '#D4AF37',
    type: 'video-showcase',
    mockupData: {
      videoDuration: '08:12',
      videoResolution: '4K DCI (4096x2160)'
    }
  },
  {
    id: 'apex-realty-concierge',
    title: 'Apex Prime Real Estate',
    category: 'web',
    categoryLabel: 'Website & Business Portal',
    tagline: 'Ultra-luxury architectural property showcase for high-net-worth real estate buyers.',
    description: 'Interactive property floor plans, panoramic virtual viewing gallery, neighborhood guide, and VIP private inspection scheduler via WhatsApp.',
    challenge: 'High-resolution architectural renders were causing heavy mobile lag on competitor platforms.',
    solution: 'Architected client-side lazy caching with responsive WebP image optimization and a persistent WhatsApp concierge trigger.',
    results: [
      'Average session duration increased by +180%',
      'Over 60 high-value villa viewings scheduled within 60 days',
      'Smooth 60fps animations across all mobile browsers'
    ],
    client: 'Apex Prime Real Estate Group',
    year: '2026',
    deliverables: ['Custom Real Estate Portal', 'Interactive Floorplan Viewer', 'WhatsApp VIP Scheduler', 'SEO Architecture'],
    toolsUsed: ['React', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    featured: false,
    accentColor: '#D8AF44',
    type: 'web-showcase',
    mockupData: {
      statMetric: '+180%',
      statLabel: 'Session Duration',
      pages: ['Featured Villas', 'Penthouse Vault', 'Neighborhood Guide', 'VIP Tour Desk']
    }
  }
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'web-starter',
    name: 'Essential Launch',
    tagline: 'Ideal for modern business owners launching a distinctive digital footprint.',
    price: 'Custom Tier',
    billingCycle: 'Per Project',
    features: [
      'Up to 5 custom-designed responsive pages',
      'Mobile-first responsive architecture',
      'Contact form with instant WhatsApp alerts',
      'Core SEO setup & social preview cards',
      'High-speed hosting deployment assistance',
      '30 days post-launch technical warranty'
    ],
    turnaround: '5–7 Business Days',
    serviceCategory: 'web',
    whatsappMessage: 'Hi Vijay, I would like to inquire about the Essential Launch Web Development package for my business.'
  },
  {
    id: 'web-professional',
    name: 'Executive & E-Commerce',
    tagline: 'Engineered for brands and e-commerce stores wanting high conversions and speed.',
    price: 'Most Popular',
    billingCycle: 'Per Project',
    popular: true,
    features: [
      'Full custom business website or e-commerce store',
      'Seamless payment gateway integration (Razorpay/UPI/Stripe)',
      'Product catalog, shopping cart & inventory management',
      'Custom animations, fluid micro-interactions & speed optimization',
      'Interactive quote calculator or service booking system',
      'Advanced technical SEO & Google Analytics setup',
      'WhatsApp direct ordering integration',
      '60 days priority VIP support & minor revisions'
    ],
    turnaround: '10–14 Business Days',
    serviceCategory: 'web',
    whatsappMessage: 'Hi Vijay, I am interested in the Executive & E-Commerce package for my brand. Let us discuss the scope!'
  },
  {
    id: 'video-wedding-gold',
    name: 'Cinematic Royal Wedding',
    tagline: 'Signature Hollywood-caliber wedding video editing for lifetime memories.',
    price: 'Bespoke Cinema',
    billingCycle: 'Per Wedding',
    popular: true,
    features: [
      'Signature warm-gold cinematic color grading',
      'Multi-camera ceremony footage synchronization (up to 4 cams)',
      '60-90s Instagram cinematic teaser (9:16 vertical & 16:9)',
      '5-8 minute cinematic highlight film with emotional sound design',
      'Full ceremony & speeches documentary edit',
      'Drone aerial shot stabilization & dialogue noise cleaning',
      'Master 4K 60fps digital delivery with cloud backup'
    ],
    turnaround: '7–10 Business Days',
    serviceCategory: 'video',
    whatsappMessage: 'Hi Vijay, I want to book your Wedding Video Editing service for an upcoming wedding. Let us check dates!'
  },
  {
    id: 'graphics-brand-suite',
    name: 'Luxury Brand Identity',
    tagline: 'Complete visual identity system for discerning brands wanting to command premium rates.',
    price: 'Brand Signature',
    billingCycle: 'Per System',
    features: [
      'Primary logo, monogram, watermark & favicon suite',
      'Comprehensive brand guidelines manual (PDF & Figma)',
      'Gold-embossed luxury stationery (Business cards, letterheads)',
      'Social media master kit (10 editable post & story templates)',
      'Product packaging or brochure layout design',
      'Full vector source files (AI, EPS, SVG, PNG, PDF)'
    ],
    turnaround: '4–6 Business Days',
    serviceCategory: 'graphics',
    whatsappMessage: 'Hi Vijay, I want to discuss a custom Graphic Design & Luxury Brand Identity package with you.'
  }
];

export const TESTIMONIALS_DATA: TestimonialItem[] = [
  {
    id: 't-1',
    name: 'Rajesh Singhania',
    role: 'Founder & CEO',
    companyOrEvent: 'Singhania Real Estate & Landholdings',
    serviceUsed: 'Business Website & Development',
    quote: 'Vijay transformed our digital presence completely. The black and gold aesthetic radiates high net worth luxury, and our high-ticket client inquiries doubled within the first month. Incredible attention to detail.',
    rating: 5,
    location: 'Hyderabad, India'
  },
  {
    id: 't-2',
    name: 'Dr. Priya & Rohit Verma',
    role: 'Bride & Groom',
    companyOrEvent: 'Udaipur Palace Wedding',
    serviceUsed: 'Wedding Video Editing',
    quote: 'Watching our wedding film edited by Vijay brought tears to our entire family. The color grading is pure royal cinema, the music choices gave us goosebumps, and he delivered right on time. Vijay Visuals is the real deal.',
    rating: 5,
    location: 'Jaipur, India'
  },
  {
    id: 't-3',
    name: 'Anand Kumar',
    role: 'Managing Director',
    companyOrEvent: 'Kavya Botanicals & Luxury Skincare',
    serviceUsed: 'E-commerce Website & Graphic Design',
    quote: 'From our gold foil logo identity to our ultra-fast Shopify store, Vijay handled everything with masterclass precision. Our customers constantly compliment the design, and our checkout runs effortlessly.',
    rating: 5,
    location: 'Bengaluru, India'
  }
];

export const FAQS = [
  {
    question: 'How do we get started on a project with Vijay Visuals?',
    answer: 'Simply reach out via WhatsApp at +91 93813 62201 or submit the inquiry form below. We will discuss your vision, timeline, and exact deliverables, provide a clear proposal, and initiate work immediately upon deposit.'
  },
  {
    question: 'What is your typical turnaround time for website development and video editing?',
    answer: 'Standard business websites and branding packages are typically delivered within 5 to 10 business days. Wedding video highlights and teasers are edited and delivered within 7 to 10 days, with express 72-hour turnaround options available upon request.'
  },
  {
    question: 'How do you handle footage delivery for wedding video editing?',
    answer: 'You can upload your raw camera files (Sony, Canon, Blackmagic, RED, Drone log files) via high-speed Google Drive, Dropbox, or WeTransfer links. Once edited, we deliver pristine 4K master files and compressed versions ready for Instagram, YouTube, and family distribution.'
  },
  {
    question: 'Will my website work smoothly on all mobile devices and have SEO?',
    answer: 'Every website we build is mobile-first, responsive across all screen sizes, and optimized for sub-second load times. We include complete technical SEO, OpenGraph social share cards, and fast cloud hosting configuration.'
  },
  {
    question: 'Can you customize packages to fit our exact requirements?',
    answer: 'Yes! While we offer standardized packages, most clients have unique needs. We are happy to tailor custom scopes combining web development, e-commerce, video editing, and graphic design.'
  }
];
