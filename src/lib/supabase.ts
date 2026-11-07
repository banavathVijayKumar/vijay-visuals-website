import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types for Multi-Tenant Website Builder & Delivery System
export type UserRole = 'super_admin' | 'admin' | 'shop_owner' | 'delivery_boy' | 'customer' | 'support_agent';
export type AccountStatus = 'active' | 'inactive' | 'pending_invite' | 'suspended';
export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'assigned'
  | 'accepted'
  | 'out_for_delivery'
  | 'reached_location'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  avatar_url?: string;
  business_ids?: string[];
  active_business_id?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  created_at: string;
}

export interface DeliveryBoyProfile {
  id: string;
  vehicle_type: 'Bike' | 'Scooter' | 'Electric Vehicle' | 'Car';
  vehicle_number: string;
  assigned_area: string;
  active_status: 'available' | 'busy' | 'offline';
  invitation_token?: string;
  invited_at?: string;
  total_deliveries: number;
  rating: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  variant?: string;
}

export interface Order {
  id: string;
  order_number: string;
  business_id: string;
  business_name: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_city: string;
  delivery_lat?: number;
  delivery_lng?: number;
  items: OrderItem[];
  total_amount: number;
  payment_method: 'cod' | 'upi' | 'razorpay';
  payment_status: 'pending' | 'paid' | 'refunded';
  order_status: OrderStatus;
  assigned_delivery_boy_id?: string | null;
  assigned_delivery_boy_name?: string;
  assigned_at?: string;
  accepted_at?: string;
  out_for_delivery_at?: string;
  reached_location_at?: string;
  delivered_at?: string;
  delivery_notes?: string;
  delivery_proof_url?: string;
  created_at: string;
}

export interface BusinessTenant {
  id: string;
  owner_id: string;
  business_name: string;
  slug: string;
  category: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  theme_color: string;
  font_family: string;
  language: 'en' | 'te' | 'hi';
  status: 'active' | 'suspended';
  subdomain: string;
  logo_url?: string;
  banner_url?: string;
  created_at: string;
}

export interface BusinessTemplate {
  id: string;
  name: string;
  name_te: string;
  name_hi: string;
  category: string;
  description: string;
  badge: string;
  accent_color: string;
  preview_bg: string;
  features: string[];
  demo_slug: string;
}

// Supabase Client Initialization with fallback
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key'
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ============================================================================
// 35+ PROFESSIONAL INDUSTRY TEMPLATES (Re-exported from templatesData.ts)
// ============================================================================
export { TEMPLATES_DATA } from './templatesData';
export * from './saasServices';

const UNUSED_OLD_TEMPLATES: BusinessTemplate[] = [
  {
    id: 'food-restaurant',
    name: 'Royal Feast Cloud Kitchen & Restaurant',
    name_te: 'రాయల్ ఫీస్ట్ రెస్టారెంట్ & క్లౌడ్ కిచెన్',
    name_hi: 'रॉयल फीस्ट रेस्तरां एवं क्लाउड किचन',
    category: 'Food & Dining',
    description: 'Online ordering, digital food menu with photos, spice ratings, table reservations & live order delivery tracking.',
    badge: 'Trending',
    accent_color: '#E65100',
    preview_bg: 'from-amber-950/60 to-orange-950/30',
    features: ['Instant WhatsApp Ordering', 'Digital Dine-in QR Menu', 'Delivery Time Calculator', 'Spice Level Filter'],
    demo_slug: 'royal-feast',
  },
  {
    id: 'cinema-photography',
    name: 'Aura Cinema & Wedding Photography',
    name_te: 'ఆరా సినిమా & వెడ్డింగ్ ఫోటోగ్రఫీ',
    name_hi: 'ऑरा सिनेमा एवं वेडिंग फोटोग्राफी',
    category: 'Creative & Media',
    description: 'Cinematic wedding portfolio showcase, 4K showreels, pre-wedding booking slots, client proofing galleries & gear vault.',
    badge: 'Signature',
    accent_color: '#DFBA5A',
    preview_bg: 'from-yellow-950/60 to-stone-950/30',
    features: ['4K Video Reel Player', 'Date Availability Calendar', 'Package Builder', 'Private Client Gallery'],
    demo_slug: 'aura-cinema',
  },
  {
    id: 'grocery-supermarket',
    name: 'Fresh Mart Grocery & Supermarket',
    name_te: 'ఫ్రెష్ మార్ట్ సూపర్ మార్కెట్ & కిరాణా',
    name_hi: 'फ्रेश मार्ट किराना एवं सुपरमार्केट',
    category: 'Retail & Grocery',
    description: 'Daily essentials, fresh vegetables, express 30-minute delivery dispatch, barcode search, multi-category cart.',
    badge: 'High Demand',
    accent_color: '#2E7D32',
    preview_bg: 'from-emerald-950/60 to-green-950/30',
    features: ['Express Delivery Dispatch', 'Weight/Kg Unit Selector', 'Quick Reorder Basket', 'WhatsApp Bill Sharing'],
    demo_slug: 'fresh-mart',
  },
  {
    id: 'luxury-jewelry',
    name: 'Kalyan Heritage Gold & Diamond Atelier',
    name_te: 'కళ్యాణ్ హెరిటేజ్ బంగారం & వజ్రాల షోరూమ్',
    name_hi: 'कल्याण हेरिटेज गोल्ड एवं डायमंड ज्वेलरी',
    category: 'Luxury & Jewelry',
    description: 'Precious 22K/18K gold catalog, diamond certs, virtual video appointment booking, gold rate live ticker & bespoke ring builder.',
    badge: 'Luxury',
    accent_color: '#D4AF37',
    preview_bg: 'from-yellow-950/70 to-amber-950/40',
    features: ['Daily Gold Rate Banner', '360° Ring Viewer', 'VIP Video Consultation Booking', 'Hallmark Authenticity'],
    demo_slug: 'kalyan-jewelry',
  },
  {
    id: 'fashion-boutique',
    name: 'Vogue Silk & Designer Couture',
    name_te: 'వోగ్ సిల్క్ & డిజైనర్ బొటిక్',
    name_hi: 'वोग सिल्क एवं डिजाइनर बुटीक',
    category: 'Fashion & Apparel',
    description: 'Designer sarees, lehengas, size guides, custom tailoring add-on, lookbook grid, Instagram shoppable gallery.',
    badge: 'Popular',
    accent_color: '#C2185B',
    preview_bg: 'from-pink-950/60 to-rose-950/30',
    features: ['Custom Stitching Measurements', 'Color Swatch Picker', 'Fabric Zoom Lens', 'Instant Size Guide'],
    demo_slug: 'vogue-couture',
  },
  {
    id: 'healthcare-clinic',
    name: 'Sanjeevani Multispeciality Clinic & Pharmacy',
    name_te: 'సంజీవని మల్టీస్పెషాలిటీ క్లినిక్ & ఫార్మసీ',
    name_hi: 'संजीवनी मल्टीस्पेशलिटी क्लिनिक एवं फार्मेसी',
    category: 'Healthcare',
    description: 'Doctor appointment scheduling, prescription medicine delivery, symptom checker, emergency ambulance call button.',
    badge: 'Essential',
    accent_color: '#0288D1',
    preview_bg: 'from-cyan-950/60 to-sky-950/30',
    features: ['Doctor Time-Slot Booking', 'Upload Prescription Form', 'Emergency Quick Call', 'Patient Review Vault'],
    demo_slug: 'sanjeevani-clinic',
  },
  {
    id: 'real-estate-builders',
    name: 'Apex Luxury Villas & Properties',
    name_te: 'అపెక్స్ లగ్జరీ విల్లాస్ & రియల్ ఎస్టేట్',
    name_hi: 'एपेक्स लक्जरी विला एवं रियल एस्टेट',
    category: 'Real Estate',
    description: 'Gated community villas, interactive floor plans, EMI calculator, drone site tour videos, private inspection bookings.',
    badge: 'High Value',
    accent_color: '#1565C0',
    preview_bg: 'from-blue-950/60 to-indigo-950/30',
    features: ['Interactive Floorplan View', 'Mortgage EMI Calculator', 'WhatsApp Brochure Download', 'Google Maps Coordinates'],
    demo_slug: 'apex-properties',
  },
  {
    id: 'gym-fitness',
    name: 'Spartan Elite Crossfit & Fitness',
    name_te: 'స్పార్టన్ ఎలైట్ ఫిట్‌నెస్ & జిమ్',
    name_hi: 'स्पार्टन एलीट क्रॉसफिट एवं जिम',
    category: 'Fitness & Sports',
    description: 'Membership plan subscriptions, personal trainer bios, trial pass booking, workout class timetable, diet plans.',
    badge: 'Active',
    accent_color: '#D32F2F',
    preview_bg: 'from-red-950/60 to-zinc-950/30',
    features: ['Free 1-Day Trial Pass', 'Trainer Booking Slots', 'Diet & BMI Estimator', 'Member Progress Stories'],
    demo_slug: 'spartan-fitness',
  },
  {
    id: 'beauty-salon-spa',
    name: 'Luxe Aura Unisex Salon & Wellness Spa',
    name_te: 'లక్స్ ఆరా యునిసెక్స్ సెలూన్ & వెల్‌నెస్ స్పా',
    name_hi: 'लक्स ऑरा यूनिसेक्स सैलून एवं स्पा',
    category: 'Beauty & Wellness',
    description: 'Bridal makeover packages, hair styling menu, online slot booking with advance deposit, expert stylist selector.',
    badge: 'Trending',
    accent_color: '#7B1FA2',
    preview_bg: 'from-purple-950/60 to-fuchsia-950/30',
    features: ['Stylist & Seat Booking', 'Bridal Package Estimator', 'Before/After Showcase', 'Service Combo Discounts'],
    demo_slug: 'luxe-salon',
  },
  {
    id: 'education-coaching',
    name: 'Chanakya IAS & Competitive Academy',
    name_te: 'చాణక్య ఐఏఎస్ & కాంపిటీటివ్ అకాడమీ',
    name_hi: 'चाणक्य आईएएस एवं प्रतियोगी अकादमी',
    category: 'Education',
    description: 'Course catalog, mock test series enrollments, study material downloads, faculty directory, demo class booking.',
    badge: 'Academics',
    accent_color: '#00796B',
    preview_bg: 'from-teal-950/60 to-emerald-950/30',
    features: ['Free Demo Lecture Access', 'PDF Syllabus Downloads', 'Batch Timings Matrix', 'Student Ranker Hall of Fame'],
    demo_slug: 'chanakya-academy',
  },
  {
    id: 'bakery-cakes',
    name: 'Velvet Crumbs Artisan Bakery & Pastry',
    name_te: 'వెల్వెట్ క్రంబ్‌స్ బేకరీ & కేక్ షాప్',
    name_hi: 'वेलवेट क्रम्ब्स बेकरी एवं पेस्ट्री',
    category: 'Food & Dining',
    description: 'Custom photo cake ordering, midnight surprise delivery slot, flavor customizer, eggless/gluten-free filters.',
    badge: 'Sweet',
    accent_color: '#F06292',
    preview_bg: 'from-rose-950/60 to-pink-950/30',
    features: ['Custom Photo/Message on Cake', 'Midnight Delivery Scheduler', 'Eggless/Vegan Filter', 'Sweet Box Combos'],
    demo_slug: 'velvet-bakery',
  },
  {
    id: 'electronics-repair',
    name: 'TechPro Mobile, Laptop & Gadget Repair',
    name_te: 'టెక్ ప్రో మొబైల్ & ల్యాప్‌టాప్ రిపేర్',
    name_hi: 'टेकप्रो मोबाइल एवं लैपटॉप रिपेयर',
    category: 'Services & Tech',
    description: 'Doorstep pickup & drop booking, instant price quote by device model, genuine parts warranty, repair status tracker.',
    badge: 'Quick Fix',
    accent_color: '#0097A7',
    preview_bg: 'from-cyan-950/60 to-slate-950/30',
    features: ['Device Model Quote Estimator', 'Doorstep Pickup Request', '90-Day Warranty Badge', 'Live Status Tracker'],
    demo_slug: 'techpro-repair',
  },
  {
    id: 'wedding-events',
    name: 'Shree Utsav Royal Wedding & Event Planners',
    name_te: 'శ్రీ ఉత్సవ్ రాయల్ వెడ్డింగ్ & ఈవెంట్ ప్లానర్స్',
    name_hi: 'श्री उत्सव रॉयल वेडिंग एवं इवेंट प्लानर्स',
    category: 'Events & Weddings',
    description: 'End-to-end wedding decor themes, catering management, mandap 3D concepts, budget calculator & live enquiry desk.',
    badge: 'Grand',
    accent_color: '#FF8F00',
    preview_bg: 'from-orange-950/60 to-yellow-950/30',
    features: ['Destination Wedding Planner', 'Mandap Theme Gallery', 'Event Budget Estimator', 'Vendor Coordination'],
    demo_slug: 'shree-utsav',
  },
  {
    id: 'auto-garage',
    name: 'SpeedWheels Multi-Brand Car Service Hub',
    name_te: 'స్పీడ్ వీల్స్ మల్టీ-బ్రాండ్ కార్ సర్వీస్',
    name_hi: 'स्पीडव्हील्स मल्टी-ब्रांड कार सर्विस हब',
    category: 'Automotive',
    description: 'Periodic service packages, ceramic coating, roadside assistance SOS, pickup scheduling, digital job card.',
    badge: 'Auto Care',
    accent_color: '#455A64',
    preview_bg: 'from-slate-950/60 to-zinc-950/30',
    features: ['Periodic Service Menu', 'Emergency SOS Roadside Help', 'Free Pickup & Drop', 'Transparent Part Pricing'],
    demo_slug: 'speedwheels-hub',
  },
  {
    id: 'florist-gifts',
    name: 'Blossom & Petals Luxury Floral Studio',
    name_te: 'బ్లోసమ్ & పెటల్స్ పూల దుకాణం & బహుమతులు',
    name_hi: 'ब्लॉसम एवं पेटल्स फ्लोरल स्टूडियो एवं गिफ्ट्स',
    category: 'Gifts & Flowers',
    description: 'Same-day fresh flower bouquets, anniversary chocolates, exotic orchids, handwritten message cards, express delivery.',
    badge: 'Fresh',
    accent_color: '#E91E63',
    preview_bg: 'from-pink-950/60 to-fuchsia-950/30',
    features: ['Same-Day 2-Hour Delivery', 'Add Custom Card Note', 'Luxury Box Presentation', 'Occasion Curated Combos'],
    demo_slug: 'blossom-petals',
  },
  {
    id: 'legal-consulting',
    name: 'Nyaya Legal & Corporate Tax Advisory',
    name_te: 'న్యాయ లీగల్ & కార్పొరేట్ టాక్స్ కన్సల్టెన్సీ',
    name_hi: 'न्याय लीगल एवं कॉर्पोरेट टैक्स कंसल्टेंसी',
    category: 'Professional Services',
    description: 'Confidential client consultation bookings, GST & income tax filing, contract drafting, trademark services.',
    badge: 'Advisory',
    accent_color: '#37474F',
    preview_bg: 'from-neutral-950/60 to-slate-950/30',
    features: ['Confidential Video Consultation', 'Fixed-Fee Service Packages', 'Document Checklist Vault', 'Corporate Retainer'],
    demo_slug: 'nyaya-legal',
  },
  {
    id: 'hotel-resort',
    name: 'Serene Hills Boutique Eco Resort',
    name_te: 'సెరీన్ హిల్స్ బొటిక్ రిసార్ట్ & హోటల్',
    name_hi: 'सेरीन हिल्स बुटीक इको रिजॉर्ट',
    category: 'Hospitality',
    description: 'Room & villa booking engine, amenities showcase, organic farm-to-table dining, local tour packages.',
    badge: 'Getaway',
    accent_color: '#33691E',
    preview_bg: 'from-lime-950/60 to-emerald-950/30',
    features: ['Direct Room Booking Engine', 'Seasonal Weekend Rates', 'Tour & Trekking Guides', 'Dining Pre-Order'],
    demo_slug: 'serene-resort',
  },
  {
    id: 'pet-shop-vet',
    name: 'HappyPaws Pet Store & Veterinary Care',
    name_te: 'హ్యాపీ పాస్ పెట్ స్టోర్ & వెటర్నరీ క్లినిక్',
    name_hi: 'हैप्पी पॉज पेट स्टोर एवं वेटरनरी क्लिनिक',
    category: 'Pet Care',
    description: 'Premium pet food delivery, grooming salon appointments, vaccinations, pet accessories & adoptable pets.',
    badge: 'Pet Friendly',
    accent_color: '#F57C00',
    preview_bg: 'from-orange-950/60 to-amber-950/30',
    features: ['Grooming Slot Booking', 'Monthly Food Subscription', 'Vet Tele-Consultation', 'Pet Age Diet Matcher'],
    demo_slug: 'happypaws-pets',
  },
  {
    id: 'interior-decor',
    name: 'Sylvan Living Interiors & Architecture',
    name_te: 'సిల్వాన్ లివింగ్ ఇంటీరియర్స్ & ఆర్కిటెక్చర్',
    name_hi: 'सिल्वान लिविंग इंटीरियर्स एवं वास्तुकला',
    category: 'Home & Decor',
    description: '3D modular kitchen designs, living room revamps, material finishes catalog, quote calculator, on-site consultation.',
    badge: 'Aesthetic',
    accent_color: '#8D6E63',
    preview_bg: 'from-stone-950/60 to-yellow-950/30',
    features: ['Room Cost Estimator', '3D Walkthrough Gallery', 'Material Palette Board', 'Free Site Visit Booking'],
    demo_slug: 'sylvan-interiors',
  },
  {
    id: 'organic-farm-dairy',
    name: 'Prakriti A2 Desi Cow Milk & Organic Farm',
    name_te: 'ప్రకృతి స్వచ్ఛమైన A2 పాలు & సేంద్రీయ ఉత్పత్తులు',
    name_hi: 'प्रकृति A2 देसी गाय का दूध एवं जैविक उत्पाद',
    category: 'Agriculture & Dairy',
    description: 'Daily morning glass-bottle milk subscription, cold-pressed oils, organic grains, farm visit tours, WhatsApp pause/resume.',
    badge: '100% Pure',
    accent_color: '#558B2F',
    preview_bg: 'from-green-950/60 to-emerald-950/30',
    features: ['Daily Milk Calendar Delivery', 'Pause/Resume via WhatsApp', 'A2 Lab Test Certs', 'Farm Gate Visit Passes'],
    demo_slug: 'prakriti-dairy',
  },
  {
    id: 'tailoring-boutique',
    name: 'Royal Master Custom Tailors & Drapers',
    name_te: 'రాయల్ మాస్టర్ కస్టమ్ టైలర్స్',
    name_hi: 'रॉयल मास्टर कस्टम टेलर्स',
    category: 'Tailoring & Craft',
    description: 'Doorstep measurement master visits, bespoke sherwanis, suits, blouse patterns, expedited stitching within 48 hours.',
    badge: 'Crafted',
    accent_color: '#4E342E',
    preview_bg: 'from-amber-950/60 to-stone-950/30',
    features: ['Doorstep Measurement Booking', '48-Hour Urgent Stitching', 'Fabric & Pattern Library', 'Trial & Fitting Guarantee'],
    demo_slug: 'royal-tailors',
  }
];

// ============================================================================
// INITIAL SEED DATA FOR DEMO & TESTING
// ============================================================================
const SEED_PROFILES: UserProfile[] = [
  {
    id: 'usr-admin-01',
    email: 'admin@vijayvisuals.com',
    full_name: 'Vijay Kumar (Platform Super Admin)',
    phone: '+91 93813 62201',
    role: 'admin',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr-del-01',
    email: 'delivery1@vijayvisuals.com',
    full_name: 'Ramesh Kumar',
    phone: '+91 98480 12345',
    role: 'delivery_boy',
    status: 'active',
    created_at: '2026-02-10T10:00:00Z',
  },
  {
    id: 'usr-del-02',
    email: 'suresh.delivery@vijayvisuals.com',
    full_name: 'Suresh Reddy',
    phone: '+91 97000 54321',
    role: 'delivery_boy',
    status: 'active',
    created_at: '2026-02-15T12:00:00Z',
  },
  {
    id: 'usr-del-03',
    email: 'anil.delivery@vijayvisuals.com',
    full_name: 'Anil Varma',
    phone: '+91 99887 66554',
    role: 'delivery_boy',
    status: 'pending_invite',
    created_at: '2026-03-01T08:00:00Z',
  },
  {
    id: 'usr-shop-01',
    email: 'vikram@aurajewels.com',
    full_name: 'Vikramaditya Rao',
    phone: '+91 94400 11223',
    role: 'shop_owner',
    status: 'active',
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'usr-cust-01',
    email: 'rahul@gmail.com',
    full_name: 'Rahul Sharma',
    phone: '+91 91234 56789',
    role: 'customer',
    status: 'active',
    created_at: '2026-02-20T14:00:00Z',
  }
];

const SEED_DELIVERY_BOYS: Record<string, DeliveryBoyProfile> = {
  'usr-del-01': {
    id: 'usr-del-01',
    vehicle_type: 'Bike',
    vehicle_number: 'TS 09 EA 4589',
    assigned_area: 'Banjara Hills & Jubilee Hills (Hyderabad)',
    active_status: 'available',
    total_deliveries: 142,
    rating: 4.9,
    notes: 'Punctual, handles delicate luxury jewelry & electronics with care.',
  },
  'usr-del-02': {
    id: 'usr-del-02',
    vehicle_type: 'Electric Vehicle',
    vehicle_number: 'TS 07 EV 8812',
    assigned_area: 'Madhapur, Hitec City & Gachibowli',
    active_status: 'available',
    total_deliveries: 89,
    rating: 4.85,
    notes: 'Specializes in express 30-min cloud kitchen & bakery orders.',
  },
  'usr-del-03': {
    id: 'usr-del-03',
    vehicle_type: 'Scooter',
    vehicle_number: 'TS 10 AB 3411',
    assigned_area: 'Secunderabad & Begumpet',
    active_status: 'offline',
    invitation_token: 'inv_anil_9921b7_token',
    invited_at: '2026-03-01T08:00:00Z',
    total_deliveries: 0,
    rating: 5.0,
    notes: 'Invitation sent, pending initial password setup.',
  }
};

const SEED_BUSINESSES: BusinessTenant[] = [
  {
    id: 'biz-01',
    owner_id: 'usr-shop-01',
    business_name: 'Aura Haute Joaillerie & Diamond Atelier',
    slug: 'aura-jewels',
    category: 'Luxury & Jewelry',
    tagline: '22K Hallmarked Gold, Solitaire Diamonds & Royal Heritage Bridal Sets',
    phone: '+91 93813 62201',
    whatsapp: '919381362201',
    email: 'contact@aurajewels.com',
    address: 'Road No 36, Jubilee Hills, Near Metro Pillar 14',
    city: 'Hyderabad',
    theme_color: '#DFBA5A',
    font_family: 'Cinzel',
    language: 'en',
    status: 'active',
    subdomain: 'aurajewels.vijayvisuals.com',
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'biz-02',
    owner_id: 'usr-shop-01',
    business_name: 'Royal Feast Gourmet Kitchen & Biryani',
    slug: 'royal-feast',
    category: 'Food & Dining',
    tagline: 'Authentic Hyderabadi Dum Biryani, Kebabs & Mughlai Delicacies',
    phone: '+91 93813 62201',
    whatsapp: '919381362201',
    email: 'orders@royalfeast.com',
    address: 'Plot 42, Hitec City Main Road, Cyber Towers',
    city: 'Hyderabad',
    theme_color: '#E65100',
    font_family: 'Plus Jakarta Sans',
    language: 'te',
    status: 'active',
    subdomain: 'royalfeast.vijayvisuals.com',
    created_at: '2026-01-20T10:00:00Z',
  }
];

const SEED_ORDERS: Order[] = [
  {
    id: 'ord-101',
    order_number: 'VV-ORD-9421',
    business_id: 'biz-01',
    business_name: 'Aura Haute Joaillerie',
    customer_id: 'usr-cust-01',
    customer_name: 'Rahul Sharma',
    customer_phone: '+91 98765 43210',
    customer_email: 'rahul@gmail.com',
    delivery_address: 'Flat 402, Skyline Residency, Road No. 10, Banjara Hills',
    delivery_city: 'Hyderabad',
    delivery_lat: 17.4156,
    delivery_lng: 78.4412,
    items: [
      { id: 'item-1', name: '22K Royal Emerald & Gold Monogram Pendant', quantity: 1, price: 42500 },
      { id: 'item-2', name: 'Velvet Presentation Box & Hallmark Certificate', quantity: 1, price: 1500 }
    ],
    total_amount: 44000,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'assigned', // Assigned to delivery1
    assigned_delivery_boy_id: 'usr-del-01',
    assigned_delivery_boy_name: 'Ramesh Kumar',
    assigned_at: '2026-11-07T09:30:00Z',
    delivery_notes: 'Urgent wedding gift delivery. Call customer 10 mins before arrival.',
    created_at: '2026-11-07T09:00:00Z',
  },
  {
    id: 'ord-102',
    order_number: 'VV-ORD-9422',
    business_id: 'biz-02',
    business_name: 'Royal Feast Kitchen',
    customer_id: 'usr-cust-01',
    customer_name: 'Pooja Reddy',
    customer_phone: '+91 97011 88990',
    customer_email: 'pooja.reddy@outlook.com',
    delivery_address: 'Villa 18, Greenwood Estates, Jubilee Hills Checkpost',
    delivery_city: 'Hyderabad',
    delivery_lat: 17.4289,
    delivery_lng: 78.4112,
    items: [
      { id: 'item-3', name: 'Royal Dum Mutton Biryani (Family Pack)', quantity: 1, price: 1250 },
      { id: 'item-4', name: 'Galouti Kebab Platter with Mint Chutney', quantity: 2, price: 780 },
      { id: 'item-5', name: 'Shahi Tukda with Saffron Rabdi', quantity: 2, price: 360 }
    ],
    total_amount: 2390,
    payment_method: 'upi',
    payment_status: 'paid',
    order_status: 'accepted',
    assigned_delivery_boy_id: 'usr-del-01',
    assigned_delivery_boy_name: 'Ramesh Kumar',
    assigned_at: '2026-11-07T10:00:00Z',
    accepted_at: '2026-11-07T10:05:00Z',
    delivery_notes: 'Ring the front gate bell. Cashless order (Prepaid via UPI).',
    created_at: '2026-11-07T09:45:00Z',
  },
  {
    id: 'ord-103',
    order_number: 'VV-ORD-9418',
    business_id: 'biz-01',
    business_name: 'Aura Haute Joaillerie',
    customer_id: 'usr-cust-01',
    customer_name: 'Dr. Anand Verma',
    customer_phone: '+91 99499 77889',
    customer_email: 'dranand@vermaclinic.com',
    delivery_address: 'Apartment 12A, Fortune Heights, Madhapur',
    delivery_city: 'Hyderabad',
    items: [
      { id: 'item-6', name: '18K Diamond Solitaire Studs', quantity: 1, price: 32000 }
    ],
    total_amount: 32000,
    payment_method: 'razorpay',
    payment_status: 'paid',
    order_status: 'delivered',
    assigned_delivery_boy_id: 'usr-del-01',
    assigned_delivery_boy_name: 'Ramesh Kumar',
    assigned_at: '2026-11-06T14:00:00Z',
    accepted_at: '2026-11-06T14:05:00Z',
    out_for_delivery_at: '2026-11-06T14:40:00Z',
    delivered_at: '2026-11-06T15:15:00Z',
    delivery_notes: 'Delivered securely to recipient in person with OTP verification.',
    delivery_proof_url: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=300',
    created_at: '2026-11-06T13:30:00Z',
  },
  {
    id: 'ord-104',
    order_number: 'VV-ORD-9423',
    business_id: 'biz-02',
    business_name: 'Royal Feast Kitchen',
    customer_id: 'usr-cust-01',
    customer_name: 'Karthik Raju',
    customer_phone: '+91 98888 22114',
    delivery_address: 'Building 4, Mindspace IT Park, Hitec City',
    delivery_city: 'Hyderabad',
    items: [
      { id: 'item-7', name: 'Paneer Butter Masala & Garlic Naan Combo', quantity: 2, price: 640 }
    ],
    total_amount: 640,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'placed', // Unassigned, available for admin to assign!
    created_at: '2026-11-07T10:15:00Z',
  }
];

// ============================================================================
// REACTIVE LOCAL PERSISTENCE STORAGE ENGINE
// Ensures full functionality offline or with live Supabase credentials!
// ============================================================================
const STORAGE_KEYS = {
  CURRENT_USER: 'vv_current_user',
  PROFILES: 'vv_profiles_store',
  DELIVERY_BOYS: 'vv_delivery_boys_store',
  ORDERS: 'vv_orders_store',
  BUSINESSES: 'vv_businesses_store',
  INVITATIONS: 'vv_invitations_store',
};

function getFromStorage<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function saveToStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Storage save error:', e);
  }
}

// Initialize default store if empty
if (!localStorage.getItem(STORAGE_KEYS.PROFILES)) {
  saveToStorage(STORAGE_KEYS.PROFILES, SEED_PROFILES);
}
if (!localStorage.getItem(STORAGE_KEYS.DELIVERY_BOYS)) {
  saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);
}
if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
  saveToStorage(STORAGE_KEYS.ORDERS, SEED_ORDERS);
}
if (!localStorage.getItem(STORAGE_KEYS.BUSINESSES)) {
  saveToStorage(STORAGE_KEYS.BUSINESSES, SEED_BUSINESSES);
}

// Listeners for reactive updates
type StoreListener = () => void;
const listeners: Set<StoreListener> = new Set();
export function subscribeToStore(cb: StoreListener) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function notifyListeners() {
  listeners.forEach(cb => cb());
}

// ============================================================================
// AUTH & SERVICE LAYER
// ============================================================================
export const authService = {
  // Current active user
  getCurrentUser(): UserProfile | null {
    return getFromStorage<UserProfile | null>(STORAGE_KEYS.CURRENT_USER, null);
  },

  // Login with role validation
  login(email: string, password?: string, expectedRole?: UserRole): { user: UserProfile; error?: string } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const cleanEmail = email.trim().toLowerCase();
    const user = profiles.find(p => p.email.toLowerCase() === cleanEmail);

    if (!user) {
      return { user: null as any, error: 'No account found matching this email address. Please verify your credentials or contact administrator.' };
    }

    // Role-specific check: Delivery Boy Login
    if (expectedRole === 'delivery_boy') {
      if (user.role !== 'delivery_boy') {
        return {
          user: null as any,
          error: `Access Denied: The Delivery Boy portal is restricted exclusively to authorized delivery staff. This email is registered as "${user.role.replace('_', ' ').toUpperCase()}".`
        };
      }
      if (user.status === 'inactive') {
        return {
          user: null as any,
          error: 'Your Delivery Boy account has been deactivated by the administrator. Please contact Vijay Visuals support.'
        };
      }
      if (user.status === 'pending_invite') {
        return {
          user: null as any,
          error: 'Your invitation is pending activation. Please use the secure invitation link provided by the administrator to set your password.'
        };
      }
    }

    // Role-specific check: Admin Login
    if (expectedRole === 'admin' && user.role !== 'admin') {
      return {
        user: null as any,
        error: 'Access Denied: Only platform administrators can access this control panel.'
      };
    }

    // Set active session
    saveToStorage(STORAGE_KEYS.CURRENT_USER, user);
    notifyListeners();
    return { user };
  },

  // Logout
  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    notifyListeners();
  },

  // Forgot password flow
  requestPasswordReset(email: string): { success: boolean; message: string; resetToken?: string } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const user = profiles.find(p => p.email.toLowerCase() === email.trim().toLowerCase());

    if (!user) {
      return { success: false, message: 'If this email is registered in our system, a password reset link has been dispatched.' };
    }

    const resetToken = 'rst_' + Math.random().toString(36).substring(2, 10);
    // In production, Supabase Auth sends an email with this token.
    return {
      success: true,
      message: `Password reset link generated securely. An email has been simulated for ${user.email}.`,
      resetToken
    };
  },

  // Reset password with token
  resetPassword(email: string, token: string, newPassword: string): { success: boolean; message: string } {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }
    return {
      success: true,
      message: 'Password updated successfully! You can now log in with your new credentials.'
    };
  }
};

// ============================================================================
// DELIVERY BOY SERVICE
// ============================================================================
export const deliveryService = {
  // Get all delivery boys for admin
  getAllDeliveryBoys(): { profile: UserProfile; details: DeliveryBoyProfile }[] {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);

    return profiles
      .filter(p => p.role === 'delivery_boy')
      .map(p => ({
        profile: p,
        details: delBoysMap[p.id] || {
          id: p.id,
          vehicle_type: 'Bike',
          vehicle_number: 'N/A',
          assigned_area: 'City Center',
          active_status: 'available',
          total_deliveries: 0,
          rating: 5.0,
        }
      }));
  },

  // Get specific delivery boy by ID
  getDeliveryBoyProfile(id: string): { profile: UserProfile; details: DeliveryBoyProfile } | null {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);
    const profile = profiles.find(p => p.id === id);
    if (!profile) return null;
    return {
      profile,
      details: delBoysMap[id] || {
        id,
        vehicle_type: 'Bike',
        vehicle_number: 'N/A',
        assigned_area: 'All Hyderabad',
        active_status: 'available',
        total_deliveries: 0,
        rating: 5.0,
      }
    };
  },

  // Admin creates a delivery boy
  createDeliveryBoy(params: {
    full_name: string;
    email: string;
    phone: string;
    vehicle_type: 'Bike' | 'Scooter' | 'Electric Vehicle' | 'Car';
    vehicle_number: string;
    assigned_area: string;
    notes?: string;
  }): { success: boolean; deliveryBoy?: UserProfile; inviteLink?: string; error?: string } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);

    const emailClean = params.email.trim().toLowerCase();
    if (profiles.some(p => p.email.toLowerCase() === emailClean)) {
      return { success: false, error: 'A user account with this email address already exists.' };
    }

    const newId = 'usr-del-' + Date.now().toString(36);
    const inviteToken = 'inv_' + Math.random().toString(36).substring(2, 12);

    const newProfile: UserProfile = {
      id: newId,
      email: emailClean,
      full_name: params.full_name.trim(),
      phone: params.phone.trim(),
      role: 'delivery_boy',
      status: 'pending_invite',
      created_at: new Date().toISOString(),
    };

    const newDetails: DeliveryBoyProfile = {
      id: newId,
      vehicle_type: params.vehicle_type,
      vehicle_number: params.vehicle_number.toUpperCase().trim(),
      assigned_area: params.assigned_area.trim(),
      active_status: 'available',
      invitation_token: inviteToken,
      invited_at: new Date().toISOString(),
      total_deliveries: 0,
      rating: 5.0,
      notes: params.notes,
    };

    profiles.push(newProfile);
    delBoysMap[newId] = newDetails;

    saveToStorage(STORAGE_KEYS.PROFILES, profiles);
    saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, delBoysMap);
    notifyListeners();

    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}?portal=delivery&action=invite&token=${inviteToken}&email=${encodeURIComponent(emailClean)}`;

    return {
      success: true,
      deliveryBoy: newProfile,
      inviteLink
    };
  },

  // Activate / Deactivate delivery boy
  toggleDeliveryBoyStatus(id: string, newStatus: AccountStatus): { success: boolean } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
      profiles[idx].status = newStatus;
      saveToStorage(STORAGE_KEYS.PROFILES, profiles);
      notifyListeners();
      return { success: true };
    }
    return { success: false };
  },

  // Update online availability
  updateAvailability(id: string, active_status: 'available' | 'busy' | 'offline'): { success: boolean } {
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);
    if (delBoysMap[id]) {
      delBoysMap[id].active_status = active_status;
      saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, delBoysMap);
      notifyListeners();
      return { success: true };
    }
    return { success: false };
  },

  // Resend invitation link
  resendInvitation(id: string): { success: boolean; inviteLink?: string } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);
    const p = profiles.find(item => item.id === id);
    if (!p) return { success: false };

    const token = 'inv_' + Math.random().toString(36).substring(2, 12);
    if (delBoysMap[id]) {
      delBoysMap[id].invitation_token = token;
      delBoysMap[id].invited_at = new Date().toISOString();
      saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, delBoysMap);
    }
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}?portal=delivery&action=invite&token=${token}&email=${encodeURIComponent(p.email)}`;
    return { success: true, inviteLink };
  },

  // Complete invitation signup
  completeInviteSignup(token: string, password: string): { success: boolean; user?: UserProfile; error?: string } {
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);

    let targetId: string | null = null;
    for (const [id, d] of Object.entries(delBoysMap)) {
      if (d.invitation_token === token) {
        targetId = id;
        break;
      }
    }

    if (!targetId) {
      return { success: false, error: 'Invalid or expired invitation token.' };
    }

    const pIdx = profiles.findIndex(p => p.id === targetId);
    if (pIdx !== -1) {
      profiles[pIdx].status = 'active';
      delete delBoysMap[targetId].invitation_token;

      saveToStorage(STORAGE_KEYS.PROFILES, profiles);
      saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, delBoysMap);
      saveToStorage(STORAGE_KEYS.CURRENT_USER, profiles[pIdx]);
      notifyListeners();
      return { success: true, user: profiles[pIdx] };
    }
    return { success: false, error: 'User not found.' };
  }
};

// ============================================================================
// ORDERS & DISPATCH SERVICE
// ============================================================================
export const orderService = {
  // All orders (Admin & Shop Owners)
  getAllOrders(): Order[] {
    return getFromStorage<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
  },

  // Lookup order by order number or id
  getOrderByNumber(orderNumber: string): Order | undefined {
    const orders = this.getAllOrders();
    const clean = orderNumber.trim().toLowerCase();
    return orders.find(o => o.order_number.toLowerCase() === clean || o.id.toLowerCase() === clean);
  },

  // Orders specifically assigned to a Delivery Boy
  getDeliveryBoyOrders(deliveryBoyId: string): Order[] {
    const orders = getFromStorage<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    return orders.filter(o => o.assigned_delivery_boy_id === deliveryBoyId);
  },

  // Assign order to delivery boy
  assignOrder(orderId: string, deliveryBoyId: string): { success: boolean } {
    const orders = getFromStorage<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const profiles = getFromStorage<UserProfile[]>(STORAGE_KEYS.PROFILES, SEED_PROFILES);
    const deliveryBoy = profiles.find(p => p.id === deliveryBoyId);

    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx].assigned_delivery_boy_id = deliveryBoyId;
      orders[idx].assigned_delivery_boy_name = deliveryBoy ? deliveryBoy.full_name : 'Assigned Partner';
      orders[idx].order_status = 'assigned';
      orders[idx].assigned_at = new Date().toISOString();

      saveToStorage(STORAGE_KEYS.ORDERS, orders);
      notifyListeners();
      return { success: true };
    }
    return { success: false };
  },

  // Update order status by delivery boy or admin
  updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    notes?: string,
    proofUrl?: string
  ): { success: boolean; order?: Order } {
    const orders = getFromStorage<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const idx = orders.findIndex(o => o.id === orderId);

    if (idx !== -1) {
      const now = new Date().toISOString();
      orders[idx].order_status = newStatus;

      if (newStatus === 'accepted') {
        orders[idx].accepted_at = now;
      } else if (newStatus === 'out_for_delivery') {
        orders[idx].out_for_delivery_at = now;
      } else if (newStatus === 'reached_location') {
        orders[idx].reached_location_at = now;
      } else if (newStatus === 'delivered') {
        orders[idx].delivered_at = now;
        orders[idx].payment_status = 'paid';
        if (proofUrl) orders[idx].delivery_proof_url = proofUrl;

        // Increment delivery boy count
        const dbId = orders[idx].assigned_delivery_boy_id;
        if (dbId) {
          const delBoysMap = getFromStorage<Record<string, DeliveryBoyProfile>>(STORAGE_KEYS.DELIVERY_BOYS, SEED_DELIVERY_BOYS);
          if (delBoysMap[dbId]) {
            delBoysMap[dbId].total_deliveries = (delBoysMap[dbId].total_deliveries || 0) + 1;
            saveToStorage(STORAGE_KEYS.DELIVERY_BOYS, delBoysMap);
          }
        }
      } else if (newStatus === 'rejected') {
        orders[idx].assigned_delivery_boy_id = null;
        orders[idx].assigned_delivery_boy_name = undefined;
        orders[idx].order_status = 'placed'; // Unassign and return to pool
      }

      if (notes) orders[idx].delivery_notes = notes;

      saveToStorage(STORAGE_KEYS.ORDERS, orders);
      notifyListeners();
      return { success: true, order: orders[idx] };
    }

    return { success: false };
  },

  // Create new customer order
  createOrder(orderData: Omit<Order, 'id' | 'order_number' | 'created_at'>): Order {
    const orders = getFromStorage<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const newOrder: Order = {
      ...orderData,
      id: 'ord-' + Date.now().toString(36),
      order_number: 'VV-ORD-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toISOString(),
    };
    orders.unshift(newOrder);
    saveToStorage(STORAGE_KEYS.ORDERS, orders);
    notifyListeners();
    return newOrder;
  }
};

// ============================================================================
// BUSINESS & MULTI-TENANT WEBSITE SERVICE
// ============================================================================
export const businessService = {
  getAllBusinesses(): BusinessTenant[] {
    return getFromStorage<BusinessTenant[]>(STORAGE_KEYS.BUSINESSES, SEED_BUSINESSES);
  },

  getBusinessBySlug(slug: string): BusinessTenant | undefined {
    const list = this.getAllBusinesses();
    return list.find(b => b.slug === slug || b.subdomain.startsWith(slug));
  },

  saveBusiness(business: BusinessTenant): { success: boolean } {
    const list = this.getAllBusinesses();
    const idx = list.findIndex(b => b.id === business.id);
    if (idx !== -1) {
      list[idx] = business;
    } else {
      list.push(business);
    }
    saveToStorage(STORAGE_KEYS.BUSINESSES, list);
    notifyListeners();
    return { success: true };
  }
};
