import React from 'react';
import { CONTACT_INFO } from '../data/content';

export type PolicyPageKey = 'privacy' | 'terms' | 'refund' | 'shipping' | 'cancellation';

/**
 * Explicit owner-input placeholders. No GSTIN, legal entity, address, grievance
 * officer or jurisdiction is invented; these values must be supplied by Vijay
 * before any policy page is treated as binding legal text.
 */
export const OWNER_INPUT_PLACEHOLDERS = [
  'Legal entity name: [OWNER INPUT REQUIRED]',
  'Registered business address: [OWNER INPUT REQUIRED]',
  'GSTIN / tax registration: [OWNER INPUT REQUIRED]',
  'Grievance / privacy contact: [OWNER INPUT REQUIRED]',
  'Governing law and jurisdiction: [OWNER INPUT REQUIRED]',
  'Refund and cancellation windows/timelines: [OWNER INPUT REQUIRED]',
  'Merchant-specific shipping charges, couriers and tracking instructions: [OWNER INPUT REQUIRED]',
] as const;

interface PolicyPage {
  title: string;
  summary: string;
  sections: Array<{ heading: string; points: string[] }>;
  pending: string[];
}

const POLICY_PAGES: Record<PolicyPageKey, PolicyPage> = {
  privacy: {
    title: 'Privacy Policy',
    summary:
      'How the VIJAY VISUALS platform separates tenant workspaces and handles customer information.',
    sections: [
      {
        heading: 'Tenant data isolation',
        points: [
          'Each business tenant workspace is isolated in the database by verified owner and website ID.',
          'Customer marketing reminders (newsletter, WhatsApp, abandoned cart) require explicit recorded opt-in consent and support one-click unsubscribe.',
        ],
      },
      {
        heading: 'Information we never request',
        points: [
          'Vijay Visuals never sells merchant customer lists or asks for domain registrar passwords, banking OTPs, or UPI PINs.',
          'All API secrets remain server-side in Cloudflare Pages Secrets and are never embedded in client JavaScript bundles.',
        ],
      },
    ],
    pending: ['Privacy contact / grievance officer details are pending owner confirmation.'],
  },
  terms: {
    title: 'Terms of Service',
    summary: 'Ownership, third-party charges and the honest scope of optional app delivery.',
    sections: [
      {
        heading: 'Merchant ownership',
        points: [
          'Merchants retain 100% ownership of their custom domains, brand assets, product catalogs, and customer data.',
        ],
      },
      {
        heading: 'Separately billed third-party services',
        points: [
          'Third-party infrastructure fees (domain registration/renewal, Cashfree MDR, WhatsApp Business Cloud API, external courier fees) are billed separately by their respective providers.',
          'Optional Progressive Web Apps (PWAs) are browser-installable web apps, not Google Play Store or Apple App Store native binaries.',
        ],
      },
    ],
    pending: ['Governing law, jurisdiction and any jurisdiction-specific terms are pending owner confirmation.'],
  },
  refund: {
    title: 'Refund Policy',
    summary: 'How platform charges and merchant storefront refunds are distinguished.',
    sections: [
      {
        heading: 'Platform payments',
        points: [
          'Platform package invoices clearly itemize one-time setup, recurring subscription, and applicable GST before payment.',
          'Domain registrations, third-party gateway fees, and consumed metered AI/messaging credits are non-refundable once provisioned with external providers.',
        ],
      },
      {
        heading: 'Storefront orders',
        points: [
          'Storefront customer refunds and returns are managed directly by the respective merchant through the order and return workflow.',
        ],
      },
    ],
    pending: [
      'Exact refund eligibility windows, request channel and processing timelines are pending owner confirmation.',
    ],
  },
  shipping: {
    title: 'Shipping Policy',
    summary: 'The current platform scope for digital delivery and merchant-managed physical shipping.',
    sections: [
      {
        heading: 'Digital delivery',
        points: [
          'Digital services are delivered to the authenticated workspace after payment verification and entitlement provisioning.',
        ],
      },
      {
        heading: 'Merchant storefront shipping',
        points: [
          'Physical product shipping, if offered by a tenant storefront, is handled by that merchant. No platform-wide delivery timeline is claimed.',
        ],
      },
    ],
    pending: [
      'Shipping timelines, courier partners, charges and tracking instructions are pending owner confirmation per merchant.',
    ],
  },
  cancellation: {
    title: 'Cancellation Policy',
    summary: 'How payment cancellation and storefront order cancellation are recorded without false success.',
    sections: [
      {
        heading: 'Payment cancellation and expiry',
        points: [
          'Cashfree cancellation and expiry events are recorded as non-paid terminal states. They never grant entitlement.',
          'A successfully verified payment remains subject to the refund policy above.',
        ],
      },
      {
        heading: 'Storefront orders',
        points: [
          'A tenant storefront order may be cancelled through the merchant order workflow where that merchant enables cancellation.',
        ],
      },
    ],
    pending: [
      'Exact cancellation windows, request channel and post-cancellation effects are pending owner confirmation.',
    ],
  },
};

interface PolicyViewProps {
  page: PolicyPageKey;
}

export const PolicyView: React.FC<PolicyViewProps> = ({ page }) => {
  const doc = POLICY_PAGES[page] || POLICY_PAGES.privacy;
  return (
    <main className="min-h-screen bg-[#060609] px-6 py-14 text-[#E4E4EE]">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-[#262635] pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">VIJAY VISUALS</p>
          <h1 className="text-3xl font-semibold text-white">{doc.title}</h1>
          <p className="text-sm text-[#9A9AAE]">{doc.summary}</p>
          <p className="text-xs text-[#7D7D90]">
            This page states only confirmed platform behaviour. Items marked pending require owner-provided
            information before they are published as binding terms.
          </p>
        </header>

        {doc.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#B6B6C8]">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-lg border border-[#3A2F1A] bg-[#12100A] p-4">
          <h2 className="text-sm font-semibold text-[#ECC86A]">Pending owner confirmation</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#C2B58F]">
            {doc.pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {OWNER_INPUT_PLACEHOLDERS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-[#262635] bg-[#0D0D13] p-4">
          <h2 className="text-sm font-semibold text-white">Verified contact channels</h2>
          <p className="mt-1 text-xs text-[#8E8EA2]">
            Use these confirmed channels for questions. Never send passwords, OTPs, API keys, bank details or documents.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#B6B6C8]">
            <a className="hover:text-[#ECC86A]" href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a>
            <a className="hover:text-[#ECC86A]" href={CONTACT_INFO.whatsappUrl}>WhatsApp</a>
            <a className="hover:text-[#ECC86A]" href={CONTACT_INFO.instagramDmUrl}>Instagram DM</a>
            <a className="hover:text-[#ECC86A]" href={`tel:${CONTACT_INFO.phone.replace(/\s/g, '')}`}>{CONTACT_INFO.phone}</a>
          </p>
        </section>

        <nav className="flex flex-wrap gap-4 border-t border-[#262635] pt-6 text-xs text-[#9A9AAE]">
          <a className="hover:text-[#ECC86A]" href="/privacy">Privacy</a>
          <a className="hover:text-[#ECC86A]" href="/terms">Terms</a>
          <a className="hover:text-[#ECC86A]" href="/refund">Refund</a>
          <a className="hover:text-[#ECC86A]" href="/shipping">Shipping</a>
          <a className="hover:text-[#ECC86A]" href="/cancellation">Cancellation</a>
          <a className="hover:text-[#ECC86A]" href="/">Back to studio</a>
        </nav>
      </article>
    </main>
  );
};
