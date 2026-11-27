// ============================================================================
// Customer Demo Business Builder data model.
// Category profiles and sample content are frontend-only demo scaffolding.
// No published website, product record, payment, or customer claim is created.
// ============================================================================

import { BUSINESS_CATEGORIES } from './content';
import { TEMPLATES_DATA, type BusinessTemplate } from '../lib/templatesData';

export { BUSINESS_CATEGORIES };

export type DemoCategoryId = (typeof BUSINESS_CATEGORIES)[number]['id'];
export type DemoPreviewMode = 'commerce' | 'food' | 'service' | 'portfolio' | 'property';
export type DemoSectionId =
  | 'hero'
  | 'catalog'
  | 'gallery'
  | 'about'
  | 'booking'
  | 'process'
  | 'faq'
  | 'contact'
  | 'map';

export interface DemoItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  image: string;
  sizes: string[];
  colors: string[];
  options: string[];
}

export interface DemoSectionConfig {
  id: DemoSectionId;
  title: string;
  visible: boolean;
  layout: 'grid' | 'list' | 'cards';
}

export interface DemoBusinessDraft {
  id: string;
  slug: string;
  categoryId: DemoCategoryId;
  templateId: string;
  templateName: string;
  identity: {
    businessName: string;
    tagline: string;
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    mapUrl: string;
    businessHours: string;
    logoImage: string;
  };
  design: {
    primaryColor: string;
    accentColor: string;
    background: string;
    fontFamily: string;
    buttonStyle: 'rounded' | 'pill' | 'square';
    headerStyle: 'standard' | 'minimal' | 'bold';
    footerStyle: 'simple' | 'detailed' | 'minimal';
    spacing: 'compact' | 'comfortable' | 'spacious';
    sectionLayout: 'grid' | 'list' | 'cards';
  };
  content: {
    heroHeadline: string;
    heroSubheadline: string;
    aboutText: string;
    bannerImage: string;
    galleryImages: string[];
  };
  items: DemoItem[];
  sections: DemoSectionConfig[];
  updatedAt: string;
  serverTenantId?: number;
}

interface DemoCategoryProfile {
  label: string;
  mode: DemoPreviewMode;
  banner: string;
  heroHeadline: string;
  heroSubheadline: string;
  itemLabel: string;
  itemSingularLabel: string;
  actionLabel: string;
  defaultPrimary: string;
  sections: DemoSectionId[];
  items: DemoItem[];
}

const MEDIA = {
  fashion: '/demo-store-fashion.jpg',
  grocery: '/demo-store-electronics.jpg',
  electronics: '/demo-store-electronics.jpg',
  dining: '/demo-store-dining.jpg',
} as const;

function item(
  id: string,
  name: string,
  description: string,
  price: string,
  category: string,
  image: string,
  sizes: string[] = [],
  colors: string[] = [],
  options: string[] = []
): DemoItem {
  return { id, name, description, price, category, image, sizes, colors, options };
}

const BASE_SECTIONS: DemoSectionId[] = ['hero', 'catalog', 'gallery', 'about', 'booking', 'contact'];

export const DEMO_CATEGORY_PROFILES: Record<DemoCategoryId, DemoCategoryProfile> = {
  clothing: {
    label: 'Clothing & Fashion',
    mode: 'commerce',
    banner: MEDIA.fashion,
    heroHeadline: 'Festive & Everyday Collections',
    heroSubheadline: 'Browse a sample fashion storefront with product details, sizes, colors, and a demo cart.',
    itemLabel: 'Products',
    itemSingularLabel: 'Product',
    actionLabel: 'Add to demo cart',
    defaultPrimary: '#8C2F5F',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('clothing-1', 'Festive Kurta Set', 'Sample ethnic wear listing with fabric and care notes.', '₹1,899', 'Ethnic Wear', MEDIA.fashion, ['S', 'M', 'L', 'XL'], ['Ivory', 'Maroon', 'Sage'], ['Dry clean only']),
      item('clothing-2', 'Everywhere Denim Jacket', 'Sample casual layer with size and color choices.', '₹2,499', 'Casuals', MEDIA.fashion, ['S', 'M', 'L'], ['Indigo', 'Charcoal'], ['Machine wash']),
      item('clothing-3', 'Occasion Saree', 'Sample festive collection entry with blouse option.', '₹3,299', 'Occasion', MEDIA.fashion, ['Free Size'], ['Gold', 'Rose', 'Emerald'], ['Blouse included']),
    ],
  },
  grocery: {
    label: 'Grocery & Organics',
    mode: 'commerce',
    banner: MEDIA.grocery,
    heroHeadline: 'Everyday Essentials, Organised',
    heroSubheadline: 'A sample neighbourhood store with categories, weights, and simple ordering.',
    itemLabel: 'Groceries',
    itemSingularLabel: 'Item',
    actionLabel: 'Add to demo basket',
    defaultPrimary: '#2F7D4F',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('grocery-1', 'Organic Staples Basket', 'Rice, pulses, and millet sample bundle.', '₹1,249', 'Staples', MEDIA.grocery, ['5 kg', '10 kg'], [], ['Organic']),
      item('grocery-2', 'Fresh Produce Box', 'Seasonal fruit and vegetable sample box.', '₹699', 'Fresh', MEDIA.grocery, ['Small', 'Family'], [], ['Weekly']),
      item('grocery-3', 'Daily Dairy Pack', 'Milk, curd, and paneer sample set.', '₹420', 'Dairy', MEDIA.grocery, ['1 L', '2 L'], [], ['Chilled']),
    ],
  },
  electronics: {
    label: 'Electronics & Tech',
    mode: 'commerce',
    banner: MEDIA.electronics,
    heroHeadline: 'Tech That Fits Your Day',
    heroSubheadline: 'A sample electronics storefront with specifications, variants, and demo checkout.',
    itemLabel: 'Products',
    itemSingularLabel: 'Product',
    actionLabel: 'Add to demo cart',
    defaultPrimary: '#2563A6',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('electronics-1', 'Wireless Headphones', 'Sample audio product with colour and warranty options.', '₹4,999', 'Audio', MEDIA.electronics, [], ['Black', 'Silver'], ['1 year warranty']),
      item('electronics-2', 'Compact Smart Speaker', 'Sample home device listing with room suggestions.', '₹3,499', 'Smart Home', MEDIA.electronics, [], ['Graphite', 'Sand'], ['Voice assistant ready']),
      item('electronics-3', 'Everyday Power Bank', 'Sample portable charger with capacity choices.', '₹1,799', 'Accessories', MEDIA.electronics, ['10K', '20K'], ['Black'], ['USB-C']),
    ],
  },
  restaurant: {
    label: 'Restaurant & Cafes',
    mode: 'food',
    banner: MEDIA.dining,
    heroHeadline: 'A Menu Worth Browsing',
    heroSubheadline: 'A sample restaurant and cafe website with menu categories, prices, and an order demo.',
    itemLabel: 'Menu',
    itemSingularLabel: 'Dish',
    actionLabel: 'Add to demo order',
    defaultPrimary: '#B45309',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('restaurant-1', 'Chef Special Thali', 'Sample regional platter with accompaniments.', '₹549', 'Signature', MEDIA.dining, ['Regular', 'Large'], [], ['Veg / Non-veg option']),
      item('restaurant-2', 'Garden Cafe Bowl', 'Sample cafe bowl with seasonal produce.', '₹399', 'Cafe', MEDIA.dining, [], [], ['Veg']),
      item('restaurant-3', 'House Dessert', 'Sample dessert entry for the menu grid.', '₹249', 'Desserts', MEDIA.dining, [], [], ['Contains dairy']),
    ],
  },
  hotel: {
    label: 'Hotel & Hospitality',
    mode: 'service',
    banner: MEDIA.dining,
    heroHeadline: 'Comfort, Clearly Presented',
    heroSubheadline: 'A sample hospitality site with rooms, facilities, and an enquiry demo.',
    itemLabel: 'Stays & Services',
    itemSingularLabel: 'Stay',
    actionLabel: 'Enquire in demo',
    defaultPrimary: '#8A5A1A',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('hotel-1', 'Deluxe Room', 'Sample room listing with occupancy and inclusions.', '₹4,200 / night', 'Rooms', MEDIA.dining, ['2 guests'], ['King', 'Twin'], ['Breakfast optional']),
      item('hotel-2', 'Family Suite', 'Sample suite listing for longer stays.', '₹7,800 / night', 'Suites', MEDIA.dining, ['4 guests'], ['King'], ['Breakfast included']),
      item('hotel-3', 'Meeting Hall', 'Sample event space with capacity information.', '₹12,000 / day', 'Facilities', MEDIA.dining, ['Up to 60'], [], ['Projector available']),
    ],
  },
  photography: {
    label: 'Photography Studios',
    mode: 'portfolio',
    banner: MEDIA.fashion,
    heroHeadline: 'A Portfolio-First Studio Website',
    heroSubheadline: 'A sample photography portfolio with galleries, packages, and an enquiry demo.',
    itemLabel: 'Packages',
    itemSingularLabel: 'Package',
    actionLabel: 'Request package details',
    defaultPrimary: '#6D28D9',
    sections: [...BASE_SECTIONS, 'process'],
    items: [
      item('photography-1', 'Portrait Session', 'Sample studio package with deliverable notes.', 'From ₹6,000', 'Portraits', MEDIA.fashion, ['1 hour', '2 hours'], [], ['Digital gallery']),
      item('photography-2', 'Event Coverage', 'Sample event package with timeline options.', 'From ₹18,000', 'Events', MEDIA.fashion, ['Half day', 'Full day'], [], ['Edited highlights']),
      item('photography-3', 'Product Shoot', 'Sample catalogue package for small businesses.', 'From ₹9,500', 'Products', MEDIA.fashion, ['10 images', '25 images'], [], ['Studio or on-site']),
    ],
  },
  real_estate: {
    label: 'Real Estate',
    mode: 'property',
    banner: MEDIA.dining,
    heroHeadline: 'Property Listings, Made Clear',
    heroSubheadline: 'A sample property website with listings, location details, and an enquiry demo.',
    itemLabel: 'Properties',
    itemSingularLabel: 'Property',
    actionLabel: 'Request a site visit',
    defaultPrimary: '#0F766E',
    sections: [...BASE_SECTIONS, 'map', 'faq'],
    items: [
      item('property-1', '2 BHK Apartment', 'Sample urban apartment listing with area and facing details.', '₹68 L', 'Apartments', MEDIA.dining, ['2 BHK'], ['East', 'West'], ['Ready to move']),
      item('property-2', 'Independent Villa', 'Sample villa listing with parking and layout notes.', '₹1.4 Cr', 'Villas', MEDIA.dining, ['3 BHK', '4 BHK'], ['North'], ['Corner plot']),
      item('property-3', 'Residential Plot', 'Sample plot listing with dimensions and location notes.', '₹32 L', 'Plots', MEDIA.dining, ['1200 sq ft'], [], ['Clear title']),
    ],
  },
  education: {
    label: 'Education & Coaching',
    mode: 'service',
    banner: MEDIA.electronics,
    heroHeadline: 'Learning Paths at a Glance',
    heroSubheadline: 'A sample academy website with courses, batches, and an enquiry demo.',
    itemLabel: 'Courses',
    itemSingularLabel: 'Course',
    actionLabel: 'Enquire about batch',
    defaultPrimary: '#1D4ED8',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('education-1', 'Foundation Course', 'Sample long-term course with weekly schedule.', '₹18,000', 'Foundation', MEDIA.electronics, ['6 months'], ['Online', 'Classroom'], ['Weekend batch']),
      item('education-2', 'Revision Program', 'Sample short revision course with test series.', '₹7,500', 'Revision', MEDIA.electronics, ['8 weeks'], ['Online'], ['Mock tests included']),
      item('education-3', 'Crash Course', 'Sample intensive program with practice sessions.', '₹4,200', 'Crash Course', MEDIA.electronics, ['4 weeks'], ['Classroom'], ['Evening batch']),
    ],
  },
  beauty_salon: {
    label: 'Beauty Salon & Spa',
    mode: 'service',
    banner: MEDIA.fashion,
    heroHeadline: 'Services, Prices, and Booking Enquiry',
    heroSubheadline: 'A sample salon website with services, pricing, gallery, and an enquiry demo.',
    itemLabel: 'Services',
    itemSingularLabel: 'Service',
    actionLabel: 'Request appointment',
    defaultPrimary: '#A21CAF',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('salon-1', 'Haircut & Styling', 'Sample service with duration and include notes.', 'From ₹899', 'Hair', MEDIA.fashion, ['30 min', '60 min'], [], ['Consultation included']),
      item('salon-2', 'Signature Facial', 'Sample skincare service with package options.', 'From ₹1,499', 'Skin', MEDIA.fashion, ['45 min', '75 min'], [], ['Skin analysis']),
      item('salon-3', 'Event Makeover', 'Sample occasion package with trial option.', 'From ₹3,500', 'Makeup', MEDIA.fashion, ['Trial', 'Final'], [], ['Trial available']),
    ],
  },
  gym: {
    label: 'Gym & Fitness',
    mode: 'service',
    banner: MEDIA.electronics,
    heroHeadline: 'Plans, Facilities, and Trainers',
    heroSubheadline: 'A sample gym website with memberships, facilities, trainer profiles, and an enquiry demo.',
    itemLabel: 'Memberships',
    itemSingularLabel: 'Plan',
    actionLabel: 'Request trial session',
    defaultPrimary: '#B91C1C',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('gym-1', 'Monthly Membership', 'Sample plan with access and facility notes.', '₹2,499 / month', 'Membership', MEDIA.electronics, ['1 month'], [], ['Gym floor access']),
      item('gym-2', 'Personal Training', 'Sample coaching plan with session choices.', '₹6,999 / month', 'Training', MEDIA.electronics, ['8 sessions', '12 sessions'], [], ['Trainer guidance']),
      item('gym-3', 'Nutrition Consultation', 'Sample diet planning service with follow-up.', '₹1,999', 'Wellness', MEDIA.electronics, ['1 session'], [], ['Plan included']),
    ],
  },
  travel: {
    label: 'Travel Agencies',
    mode: 'service',
    banner: MEDIA.dining,
    heroHeadline: 'Trips Planned Simply',
    heroSubheadline: 'A sample travel website with packages, inclusions, and an enquiry demo.',
    itemLabel: 'Packages',
    itemSingularLabel: 'Package',
    actionLabel: 'Request itinerary',
    defaultPrimary: '#0369A1',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('travel-1', 'City Break', 'Sample short getaway with stay and local travel.', 'From ₹12,500', 'Holidays', MEDIA.dining, ['2 nights'], ['Twin', 'Double'], ['Breakfast included']),
      item('travel-2', 'Pilgrimage Package', 'Sample group package with transport notes.', 'From ₹9,800', 'Pilgrimage', MEDIA.dining, ['3 nights'], [], ['Guided itinerary']),
      item('travel-3', 'Family Holiday', 'Sample family package with room options.', 'From ₹24,000', 'Family', MEDIA.dining, ['4 nights'], ['Family room'], ['Sightseeing included']),
    ],
  },
  automobile: {
    label: 'Automobile & Motors',
    mode: 'commerce',
    banner: MEDIA.electronics,
    heroHeadline: 'Vehicles and Services, Clearly Listed',
    heroSubheadline: 'A sample automobile site with inventory, variants, and an enquiry demo.',
    itemLabel: 'Inventory',
    itemSingularLabel: 'Listing',
    actionLabel: 'Enquire about listing',
    defaultPrimary: '#1F2937',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('auto-1', 'Compact Sedan', 'Sample vehicle listing with fuel and transmission options.', '₹7.8 L', 'Cars', MEDIA.electronics, ['Petrol', 'Diesel'], ['White', 'Grey'], ['Manual / Automatic']),
      item('auto-2', 'Utility SUV', 'Sample SUV listing with seating information.', '₹13.5 L', 'SUV', MEDIA.electronics, ['5 seater', '7 seater'], ['Black', 'Silver'], ['Automatic']),
      item('auto-3', 'Periodic Service Pack', 'Sample service package with labour and parts notes.', 'From ₹3,200', 'Services', MEDIA.electronics, ['Basic', 'Comprehensive'], [], ['Appointment required']),
    ],
  },
  freelancer: {
    label: 'Freelancers & Creators',
    mode: 'portfolio',
    banner: MEDIA.fashion,
    heroHeadline: 'Work Samples and Service Packages',
    heroSubheadline: 'A sample personal portfolio with project galleries, packages, and an enquiry demo.',
    itemLabel: 'Packages',
    itemSingularLabel: 'Package',
    actionLabel: 'Request details',
    defaultPrimary: '#7C3AED',
    sections: [...BASE_SECTIONS, 'process'],
    items: [
      item('freelancer-1', 'Starter Website Package', 'Sample package for a simple informational site.', 'From ₹8,000', 'Web', MEDIA.fashion, ['5 pages'], [], ['Responsive layout']),
      item('freelancer-2', 'Content Package', 'Sample package for page copy and product descriptions.', 'From ₹4,500', 'Content', MEDIA.fashion, ['10 pages'], [], ['Draft and revision']),
      item('freelancer-3', 'Maintenance Package', 'Sample ongoing care plan with update notes.', 'From ₹1,500 / month', 'Care', MEDIA.fashion, ['Monthly'], [], ['Updates included']),
    ],
  },
  professional_services: {
    label: 'Professional Services',
    mode: 'service',
    banner: MEDIA.electronics,
    heroHeadline: 'Advisory Services, Made Approachable',
    heroSubheadline: 'A sample professional services site with service cards, process, and an enquiry demo.',
    itemLabel: 'Services',
    itemSingularLabel: 'Service',
    actionLabel: 'Request consultation',
    defaultPrimary: '#334155',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('professional-1', 'Consultation Session', 'Sample advisory appointment with scope notes.', 'From ₹1,500', 'Consulting', MEDIA.electronics, ['45 min'], [], ['Online or in person']),
      item('professional-2', 'Documentation Review', 'Sample review service with turnaround options.', 'From ₹3,000', 'Review', MEDIA.electronics, ['Standard', 'Express'], [], ['Checklist included']),
      item('professional-3', 'Monthly Advisory', 'Sample retainer package with meeting cadence.', 'From ₹9,000 / month', 'Retainer', MEDIA.electronics, ['2 calls', '4 calls'], [], ['Priority queries']),
    ],
  },
  wholesale: {
    label: 'Wholesale & B2B Trade',
    mode: 'commerce',
    banner: MEDIA.grocery,
    heroHeadline: 'Bulk Ordering, Simplified',
    heroSubheadline: 'A sample wholesale catalogue with pack sizes, tiers, and an order demo.',
    itemLabel: 'Bulk Catalogue',
    itemSingularLabel: 'Product',
    actionLabel: 'Add to demo order',
    defaultPrimary: '#166534',
    sections: [...BASE_SECTIONS, 'faq'],
    items: [
      item('wholesale-1', 'Staples Trade Pack', 'Sample wholesale pack with case quantities.', '₹4,800 / case', 'Food', MEDIA.grocery, ['10 kg', '25 kg'], [], ['Bulk pricing']),
      item('wholesale-2', 'Packaging Supply Pack', 'Sample packaging bundle for retailers.', '₹2,150 / pack', 'Packaging', MEDIA.grocery, ['Small', 'Large'], [], ['Mixed sizes']),
      item('wholesale-3', ' Retail Display Unit', 'Sample display unit for shop floors.', '₹6,900', 'Display', MEDIA.grocery, ['Standard'], [], ['Assembly required']),
    ],
  },
  other: {
    label: 'Other Business Categories',
    mode: 'service',
    banner: MEDIA.dining,
    heroHeadline: 'A Flexible Business Website',
    heroSubheadline: 'A neutral sample layout for any supported local business.',
    itemLabel: 'Offerings',
    itemSingularLabel: 'Offering',
    actionLabel: 'Send demo enquiry',
    defaultPrimary: '#B45309',
    sections: [...BASE_SECTIONS, 'process', 'faq'],
    items: [
      item('other-1', 'Core Offering', 'Sample primary product or service entry.', 'From ₹999', 'Main', MEDIA.dining, ['Standard'], [], ['Edit in customize']),
      item('other-2', 'Popular Offering', 'Sample secondary product or service entry.', 'From ₹1,499', 'Popular', MEDIA.dining, ['Standard'], [], ['Edit in customize']),
      item('other-3', 'Package Offering', 'Sample bundled package entry.', 'From ₹2,999', 'Packages', MEDIA.dining, ['Standard'], [], ['Edit in customize']),
    ],
  },
};

// Every selectable template is mapped to one of the supported broad categories.
// The map is explicit so a new template cannot silently disappear from Demo Business.
export const TEMPLATE_TO_DEMO_CATEGORY: Record<string, DemoCategoryId> = {
  'grocery-store': 'grocery',
  supermarket: 'wholesale',
  'clothing-store': 'clothing',
  'fashion-boutique': 'clothing',
  'mobile-store': 'electronics',
  'electronics-store': 'electronics',
  'medical-store': 'grocery',
  pharmacy: 'grocery',
  'hospital-clinic': 'professional_services',
  restaurant: 'restaurant',
  'cloud-kitchen': 'restaurant',
  hotel: 'hotel',
  bakery: 'restaurant',
  'jewellery-store': 'clothing',
  'photography-studio': 'photography',
  'video-editing-studio': 'photography',
  'wedding-photography': 'photography',
  'event-management': 'professional_services',
  'real-estate': 'real_estate',
  'automobile-showroom': 'automobile',
  'bike-garage': 'automobile',
  'beauty-salon': 'beauty_salon',
  'spa-wellness': 'beauty_salon',
  'gym-fitness': 'gym',
  'education-coaching': 'education',
  'travel-agency': 'travel',
  'furniture-store': 'wholesale',
  'interior-design': 'freelancer',
  'hardware-store': 'wholesale',
  'pet-store': 'wholesale',
  'organic-farming': 'grocery',
  'dairy-business': 'wholesale',
  'florist-gift-store': 'other',
  'legal-financial': 'professional_services',
  'digital-marketing': 'freelancer',
  'custom-business': 'other',
};

export const DEMO_SECTION_LABELS: Record<DemoSectionId, string> = {
  hero: 'Hero banner',
  catalog: 'Products & services',
  gallery: 'Gallery',
  about: 'About',
  booking: 'Booking / enquiry',
  process: 'How it works',
  faq: 'Helpful notes',
  contact: 'Contact',
  map: 'Location',
};

export function categoryForTemplate(templateId: string): DemoCategoryId {
  return TEMPLATE_TO_DEMO_CATEGORY[templateId] || 'other';
}

export function templatesForCategory(categoryId: DemoCategoryId): BusinessTemplate[] {
  return TEMPLATES_DATA.filter((template) => categoryForTemplate(template.id) === categoryId);
}

export function categoryLabel(categoryId: DemoCategoryId): string {
  return DEMO_CATEGORY_PROFILES[categoryId]?.label || 'Other Business Categories';
}

export function slugifyDemoName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function createSections(categoryId: DemoCategoryId): DemoSectionConfig[] {
  const profile = DEMO_CATEGORY_PROFILES[categoryId];
  return profile.sections.map((id) => ({
    id,
    title: id === 'catalog' ? profile.itemLabel : DEMO_SECTION_LABELS[id],
    visible: true,
    layout: 'grid',
  }));
}

export function createDraftFromTemplate(
  template: BusinessTemplate,
  options: { id?: string; serverTenantId?: number } = {}
): DemoBusinessDraft {
  const categoryId = categoryForTemplate(template.id);
  const profile = DEMO_CATEGORY_PROFILES[categoryId];
  const unique = Math.random().toString(36).slice(2, 8);
  const slug = `${slugifyDemoName(template.demo_slug || template.name) || 'demo-business'}-${unique}`;
  return {
    id: options.id || `draft_${Date.now()}_${unique}`,
    slug,
    categoryId,
    templateId: template.id,
    templateName: template.name,
    identity: {
      businessName: template.name,
      tagline: profile.heroHeadline,
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      mapUrl: '',
      businessHours: '',
      logoImage: '',
    },
    design: {
      primaryColor: template.accent_color || profile.defaultPrimary,
      accentColor: '#0B0B10',
      background: '#0B0B10',
      fontFamily: 'Cinzel',
      buttonStyle: 'rounded',
      headerStyle: 'standard',
      footerStyle: 'simple',
      spacing: 'comfortable',
      sectionLayout: 'grid',
    },
    content: {
      heroHeadline: profile.heroHeadline,
      heroSubheadline: profile.heroSubheadline,
      aboutText: `Sample ${profile.label.toLowerCase()} website content. Replace this with your own business story in Customize.`,
      bannerImage: profile.banner,
      galleryImages: [profile.banner],
    },
    items: profile.items.map((sample) => ({ ...sample, sizes: [...sample.sizes], colors: [...sample.colors], options: [...sample.options] })),
    sections: createSections(categoryId),
    updatedAt: new Date().toISOString(),
    serverTenantId: options.serverTenantId,
  };
}

export function createDefaultDraft(): DemoBusinessDraft {
  const template = TEMPLATES_DATA.find((entry) => entry.id === 'clothing-store') || TEMPLATES_DATA[0];
  return createDraftFromTemplate(template);
}

export function buildTenantDraftPayload(draft: DemoBusinessDraft) {
  return {
    name: draft.identity.businessName || 'Demo Business Draft',
    slug: draft.slug,
    category: categoryLabel(draft.categoryId),
    templateId: draft.templateId,
    templateName: draft.templateName,
    templateFeatures: [],
    tagline: draft.identity.tagline,
    heroHeadline: draft.content.heroHeadline,
    heroSubheadline: draft.content.heroSubheadline,
    ctaText: 'Enquire',
    description: draft.content.aboutText,
    logoText: (draft.identity.businessName || 'DB').slice(0, 6).toUpperCase(),
    logoImage: draft.identity.logoImage,
    bannerImage: draft.content.bannerImage,
    galleryImages: draft.content.galleryImages,
    primaryColor: draft.design.primaryColor,
    accentColor: draft.design.accentColor,
    fontFamily: draft.design.fontFamily,
    phone: draft.identity.phone,
    whatsapp: draft.identity.whatsapp.replace(/\D/g, ''),
    address: draft.identity.address,
    businessHours: draft.identity.businessHours,
    enabledModules: {
      ecommerce: false,
      cartCheckout: false,
      gallery: true,
      bookings: true,
      whatsappOrder: false,
      reviews: false,
      wishlist: false,
      coupons: false,
      wholesale: false,
    },
    sectionOrder: draft.sections.filter((section) => section.visible).map((section) => section.id),
    customPages: [],
    demoBuilderDraft: draft,
    published: false,
    status: 'unpublished',
  };
}

export function draftFromTenantRecord(tenant: Record<string, any>): DemoBusinessDraft | null {
  const stored = tenant.demoBuilderDraft;
  if (!stored || typeof stored !== 'object') return null;
  const categoryId = String(stored.categoryId || 'other') as DemoCategoryId;
  if (!DEMO_CATEGORY_PROFILES[categoryId]) return null;
  return {
    ...(stored as DemoBusinessDraft),
    id: String(stored.id || `draft_${tenant.id}`),
    slug: String(tenant.slug || stored.slug || ''),
    serverTenantId: Number(tenant.id) || undefined,
    updatedAt: String(stored.updatedAt || tenant.updatedAt || ''),
  };
}
