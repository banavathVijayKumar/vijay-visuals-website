import { Lang } from '../data/content';

export type DomainLang = Lang;

export interface DomainTranslations {
  title: string;
  subtitle: string;
  optionA: string;
  optionADesc: string;
  optionB: string;
  optionBDesc: string;
  healthTab: string;
  notificationsTab: string;
  pricingTab: string;
  connectBtn: string;
  verifyDnsBtn: string;
  runHealthBtn: string;
  searchDomainsBtn: string;
  copyBtn: string;
  copiedBtn: string;
  primaryBadge: string;
  makePrimaryBtn: string;
  noPasswordNotice: string;
  ownershipTitle: string;
  registrarIntegrationRequired: string;
  workflowTitle: string;
  steps: string[];
}

export const DOMAIN_I18N: Partial<Record<DomainLang, DomainTranslations>> & { en: DomainTranslations } = {
  en: {
    title: 'Complete Domain Management Center',
    subtitle: 'Connect your own domain, verify live DNS & SSL, monitor website health, and keep 100% ownership.',
    optionA: 'Option A: I Already Own a Domain',
    optionADesc: 'Connect your existing .com, .in, .co.in, or subdomain using DNS TXT ownership verification.',
    optionB: 'Option B: I Want to Buy a New Domain',
    optionBDesc: 'Search domains, compare transparent first-year vs renewal fees, and register in your own account.',
    healthTab: 'Domain Health Monitor',
    notificationsTab: 'Notifications & History',
    pricingTab: 'Ownership & Package Pricing',
    connectBtn: 'Save Domain & Generate DNS Records',
    verifyDnsBtn: 'Verify Live DNS',
    runHealthBtn: 'Run Live Health Check',
    searchDomainsBtn: 'Search Domains',
    copyBtn: 'Copy',
    copiedBtn: 'Copied',
    primaryBadge: 'Primary Domain',
    makePrimaryBtn: 'Set as Primary',
    noPasswordNotice: 'Security Promise: Vijay Visuals NEVER asks for your registrar password or OTP.',
    ownershipTitle: '100% Customer Domain Ownership & Data Portability',
    registrarIntegrationRequired: 'Domain Registrar Integration Required',
    workflowTitle: '12-Step Verified Domain Connection Workflow',
    steps: [
      'Select Option',
      'Enter / Search Domain',
      'Confirm Ownership',
      'Generate DNS Records',
      'Configure DNS',
      'Check DNS Records',
      'Ownership Verified',
      'Domain Connected',
      'SSL/HTTPS Provisioning',
      'WWW & Root Redirect',
      'Domain Health Check',
      'LIVE',
    ],
  },
  te: {
    title: 'సంపూర్ణ డొమైన్ మేనేజ్‌మెంట్ సెంటర్',
    subtitle: 'మీ స్వంత డొమైన్‌ను కనెక్ట్ చేయండి, లైవ్ DNS & SSL తనిఖీ చేయండి మరియు 100% యాజమాన్యాన్ని మీ వద్దే ఉంచుకోండి.',
    optionA: 'ఆప్షన్ A: నా వద్ద ఇప్పటికే డొమైన్ ఉంది',
    optionADesc: 'DNS TXT ధృవీకరణతో మీ .com, .in, .co.in లేదా సబ్‌డొమైన్‌ను సురక్షితంగా కనెక్ట్ చేయండి.',
    optionB: 'ఆప్షన్ B: నేను కొత్త డొమైన్ కొనాలనుకుంటున్నాను',
    optionBDesc: 'డొమైన్ పేర్లను వెతకండి, మొదటి సంవత్సరం & రెన్యువల్ ధరలు చూడండి మరియు మీ స్వంత ఖాతాలో కొనండి.',
    healthTab: 'డొమైన్ హెల్త్ మానిటర్',
    notificationsTab: 'నోటిఫికేషన్లు & చరిత్ర',
    pricingTab: 'యాజమాన్యం & ప్యాకేజీ ధరలు',
    connectBtn: 'డొమైన్ సేవ్ చేసి DNS రికార్డులు పొందండి',
    verifyDnsBtn: 'లైవ్ DNS తనిఖీ చేయండి',
    runHealthBtn: 'లైవ్ హెల్త్ చెక్ చేయండి',
    searchDomainsBtn: 'డొమైన్లు వెతకండి',
    copyBtn: 'కాపీ',
    copiedBtn: 'కాపీ అయింది',
    primaryBadge: 'ప్రైమరీ డొమైన్',
    makePrimaryBtn: 'ప్రైమరీగా సెట్ చేయండి',
    noPasswordNotice: 'భద్రతా హామీ: Vijay Visuals ఎప్పుడూ మీ రిజిస్ట్రార్ పాస్‌వర్డ్ లేదా OTP అడగదు.',
    ownershipTitle: '100% కస్టమర్ డొమైన్ యాజమాన్యం & డేటా పోర్టబిలిటీ',
    registrarIntegrationRequired: 'డొమైన్ రిజిస్ట్రార్ API ఇంటిగ్రేషన్ అవసరం',
    workflowTitle: '12-దశల డొమైన్ కనెక్షన్ ప్రక్రియ',
    steps: [
      'ఆప్షన్ ఎంచుకోండి',
      'డొమైన్ నమోదు',
      'యాజమాన్యం నిర్ధారణ',
      'DNS రికార్డులు',
      'DNS సెటప్',
      'DNS తనిఖీ',
      'యాజమాన్యం ధృవీకరణ',
      'డొమైన్ కనెక్ట్',
      'SSL/HTTPS సెటప్',
      'WWW రీడైరెక్ట్',
      'హెల్త్ చెక్',
      'లైవ్ (LIVE)',
    ],
  },
  hi: {
    title: 'संपूर्ण डोमेन मैनेजमेंट सेंटर',
    subtitle: 'अपना डोमेन कनेक्ट करें, लाइव DNS और SSL जाँचें, वेबसाइट हेल्थ मॉनिटर करें और 100% स्वामित्व रखें।',
    optionA: 'विकल्प A: मेरे पास पहले से डोमेन है',
    optionADesc: 'DNS TXT सत्यापन के साथ अपना .com, .in, .co.in या सबडोमेन सुरक्षित रूप से कनेक्ट करें।',
    optionB: 'विकल्प B: मैं नया डोमेन खरीदना चाहता/चाहती हूँ',
    optionBDesc: 'डोमेन खोजें, पहले वर्ष और रिन्यूअल शुल्क की पारदर्शी तुलना देखें और अपने खाते में खरीदें।',
    healthTab: 'डोमेन हेल्थ मॉनिटर',
    notificationsTab: 'सूचनाएं और इतिहास',
    pricingTab: 'स्वामित्व और पैकेज मूल्य',
    connectBtn: 'डोमेन सेव करें और DNS रिकॉर्ड बनाएं',
    verifyDnsBtn: 'लाइव DNS जांचें',
    runHealthBtn: 'लाइव हेल्थ चेक चलाएं',
    searchDomainsBtn: 'डोमेन खोजें',
    copyBtn: 'कॉपी',
    copiedBtn: 'कॉपी हो गया',
    primaryBadge: 'प्राइमरी डोमेन',
    makePrimaryBtn: 'प्राइमरी बनाएं',
    noPasswordNotice: 'सुरक्षा गारंटी: Vijay Visuals कभी भी आपका रजिस्ट्रार पासवर्ड या OTP नहीं मांगता।',
    ownershipTitle: '100% ग्राहक डोमेन स्वामित्व और डेटा पोर्टेबिलिटी',
    registrarIntegrationRequired: 'डोमेन रजिस्ट्रार API एकीकरण आवश्यक है',
    workflowTitle: '12-चरणीय सत्यापित डोमेन कनेक्शन प्रक्रिया',
    steps: [
      'विकल्प चुनें',
      'डोमेन दर्ज करें',
      'स्वामित्व पुष्टि',
      'DNS रिकॉर्ड बनें',
      'DNS कॉन्फ़िगर करें',
      'DNS रिकॉर्ड जाँच',
      'स्वामित्व सत्यापित',
      'डोमेन कनेक्टेड',
      'SSL/HTTPS सेटअप',
      'WWW रीडायरेक्ट',
      'हेल्थ चेक',
      'लाइव (LIVE)',
    ],
  },
};
