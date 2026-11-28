import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardList,
  CreditCard,
  FileText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CONTACT_INFO, getI18n, type Lang } from '../data/content';
import { apiFetch } from '../lib/api';
import {
  BUSINESS_PACKAGE_SCOPE,
  CUSTOMER_RESPONSIBILITIES,
  CUSTOM_REQUIREMENT_MESSAGE,
  DOMAIN_AND_HOSTING_NOTE,
  PACKAGE_EXCLUSIONS,
  PACKAGE_MILESTONES,
  detectCustomRequirement,
  describeBusinessPackagePrice,
  formatInr,
  getProposedTemplatePrice,
} from '../lib/customerPricing';
import { TEMPLATES_DATA, type BusinessTemplate } from '../lib/templatesData';
import type { PlatformPlanRecord } from '../types/platform';

interface PackagePurchaseGuideProps {
  plans: PlatformPlanRecord[];
  lang?: Lang;
  preferredTemplateId?: string | null;
  onUseTemplate: (templateId: string) => void;
  onNotify: (message: string) => void;
}

interface RequirementForm {
  businessName: string;
  businessCategory: string;
  email: string;
  logoBrandColours: string;
  pagesRequired: string;
  productsServices: string;
  contactInfo: string;
  domainPreference: string;
  specialFeatures: string;
}

const EMPTY_FORM: RequirementForm = {
  businessName: '',
  businessCategory: '',
  email: '',
  logoBrandColours: '',
  pagesRequired: '5',
  productsServices: '',
  contactInfo: '',
  domainPreference: '',
  specialFeatures: '',
};

function ListPanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly string[];
  tone: 'good' | 'warn';
}) {
  const Icon = tone === 'good' ? Check : AlertCircle;
  return (
    <div className="rounded-lg border border-[#242433] bg-[#101018] p-4">
      <h4 className="mb-2 text-xs font-semibold text-white">{title}</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-[#A3A3B5]">
            <span className="mt-0.5 shrink-0">
              <Icon className={`h-3.5 w-3.5 ${tone === 'good' ? 'text-emerald-300' : 'text-amber-300'}`} />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const PackagePurchaseGuide: React.FC<PackagePurchaseGuideProps> = ({
  plans,
  lang = 'en',
  preferredTemplateId,
  onUseTemplate,
  onNotify,
}) => {
  const t = getI18n(lang);
  const price = useMemo(() => describeBusinessPackagePrice(plans), [plans]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    preferredTemplateId && TEMPLATES_DATA.some((item) => item.id === preferredTemplateId)
      ? preferredTemplateId
      : 'fashion-boutique'
  );
  const [form, setForm] = useState<RequirementForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (preferredTemplateId && TEMPLATES_DATA.some((item) => item.id === preferredTemplateId)) {
      setSelectedTemplateId(preferredTemplateId);
    }
  }, [preferredTemplateId]);

  const selectedTemplate: BusinessTemplate =
    TEMPLATES_DATA.find((item) => item.id === selectedTemplateId) || TEMPLATES_DATA[0];
  const selectedPrice = getProposedTemplatePrice(selectedTemplate.id);
  const customCheck = detectCustomRequirement({
    pageCount: Number(form.pagesRequired) || 0,
    specialFeatures: form.specialFeatures,
    domainPreference: form.domainPreference,
  });
  const optionalExtras = plans.filter(
    (plan) => plan.active && ['addon', 'addon_ai', 'addon_storage'].includes(plan.category)
  );

  const update = (key: keyof RequirementForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSubmitted(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !form.businessName.trim() ||
      !form.businessCategory.trim() ||
      !form.email.trim() ||
      !form.contactInfo.trim()
    ) {
      onNotify('Add your business name, category, valid email and contact/WhatsApp information.');
      return;
    }
    setSubmitting(true);
    try {
      const message = [
        `${customCheck.outsidePackage ? CUSTOM_REQUIREMENT_MESSAGE : '₹7,999 Business Website Package requirement'}`,
        `Business: ${form.businessName}`,
        `Category: ${form.businessCategory}`,
        `Email: ${form.email.trim()}`,
        `Preferred template: ${selectedTemplate.name} (${selectedPrice?.sku || 'n/a'})`,
        `Logo / brand colours: ${form.logoBrandColours || 'To be supplied'}`,
        `Pages required: ${form.pagesRequired || 'Not specified'}`,
        `Products / services: ${form.productsServices || 'To be supplied'}`,
        `Contact / WhatsApp: ${form.contactInfo}`,
        `Domain preference: ${form.domainPreference || 'No domain yet'}`,
        `Special features: ${form.specialFeatures || 'None'}`,
        ...customCheck.reasons,
      ].join('\n');
      await apiFetch('/api/public/platform/project-inquiry', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.businessName.trim(),
          customerEmail: form.email.trim(),
          subject: customCheck.outsidePackage
            ? CUSTOM_REQUIREMENT_MESSAGE
            : '₹7,999 Business Website Package requirement',
          message,
          category: 'project_inquiry',
          // No external WhatsApp/email is requested by this form.
          whatsappOptIn: false,
        }),
      });
      setSubmitted(true);
      onNotify(
        customCheck.outsidePackage
          ? `${CUSTOM_REQUIREMENT_MESSAGE}. Owner review is required before any charge.`
          : 'Requirement saved for Owner review. No charge has been added.'
      );
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save the requirement request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!price) {
    return (
      <section id="complete-packages" className="border-t border-[#20202E] bg-[#0A0A10] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="font-luxury text-2xl font-bold text-white">{t.customerPackageChoiceTitle}</h2>
          <p className="mt-2 text-sm text-[#A9A9BC]">
            The ₹7,999 package is not currently available from the server catalogue. No substitute price is shown.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="complete-packages" className="border-t border-[#20202E] bg-[#0A0A10] py-12 sm:py-16">
      <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-wider text-[#D4AF37]">
            B · Complete Website Packages
          </p>
          <h2 className="mt-2 font-luxury text-2xl font-bold text-white md:text-3xl">
            {t.customerPackageChoiceTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#A9A9BC]">
            {t.customerPackageChoiceSubtitle}
          </p>
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-xs text-[#C9E8D7]">
            <strong>Your selected template is included in this package.</strong> The template price is
            not charged again and is not added to the package checkout.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-[#2A2A38] bg-[#101017] p-5">
              <h3 className="font-luxury text-lg font-semibold text-white">{price.name}</h3>
              <p className="mt-1 text-[11px] text-[#8E8EA2]">
                Existing server-configured package · code {price.code} · INR default
              </p>
              <dl className="mt-5 space-y-2 text-xs">
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Selected item / package</dt>
                  <dd className="font-medium text-white">{price.name}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Selected template</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium text-white">{selectedTemplate.name}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Exact base price</dt>
                  <dd className="font-mono-tabular text-white">{formatInr(price.basePriceInr)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Template add-on</dt>
                  <dd className="font-mono-tabular font-semibold text-emerald-300">
                    {formatInr(price.templateAddOnInr)} · included
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Optional extras selected</dt>
                  <dd className="font-mono-tabular text-white">{formatInr(0)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Applicable taxes</dt>
                  <dd className="text-right text-[11px] text-white">{price.taxNote}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[#222230] pb-2">
                  <dt className="text-[#A3A3B5]">Separate recurring costs</dt>
                  <dd className="font-mono-tabular text-white">{formatInr(price.recurringInr)} now</dd>
                </div>
                <div className="flex justify-between gap-3 pt-2 text-base font-bold text-[#ECC86A]">
                  <dt>Package base price</dt>
                  <dd className="font-mono-tabular">{formatInr(price.basePriceInr)}</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-md border border-amber-500/25 bg-amber-950/10 px-3 py-2 text-[10px] leading-relaxed text-[#D8C99A]">
                {DOMAIN_AND_HOSTING_NOTE}
              </p>
              <button
                type="button"
                onClick={() => onUseTemplate(selectedTemplate.id)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-3 text-xs font-bold text-[#08080A]"
              >
                Choose This Template &amp; Continue
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <p className="mt-3 text-[10px] leading-relaxed text-[#858599]">
                Payment is started only through Cashfree and success is shown only after genuine
                server-side Cashfree verification. Razorpay is not used.
              </p>
            </div>

            <div className="rounded-xl border border-[#242433] bg-[#0D0D14] p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText className="h-4 w-4 text-[#D4AF37]" />
                Itemized package scope
              </h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8E8EA2]">
                These are bounded package deliverables, not unlimited services. Items marked
                “Owner service” require an agreed written scope; items marked “Platform capability”
                are supported by the existing builder/dashboard.
              </p>
              <ul className="mt-4 space-y-3">
                {BUSINESS_PACKAGE_SCOPE.map((item) => (
                  <li key={item.label} className="rounded-lg border border-[#222230] bg-[#101018] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white">{item.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          item.kind === 'verified-platform-capability'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {item.kind === 'verified-platform-capability' ? 'Platform capability' : 'Owner service'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#9E9EB2]">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-[#242433] bg-[#0D0D14] p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <CreditCard className="h-4 w-4 text-[#D4AF37]" />
                Payment, refund/cancellation and support transparency
              </h3>
              <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-[#A3A3B5]">
                <li>Cashfree is the only intended VIJAY VISUALS platform payment gateway.</li>
                <li>Domain, hosting renewals, gateway approval/MDR and premium plugins are not included unless separately purchased and configured.</li>
                <li>A verified refund/cancellation policy has not been published yet. No refund is promised here; contact support before payment for written terms.</li>
                <li>Support contact: {CONTACT_INFO.email} · {CONTACT_INFO.whatsappDisplay}.</li>
              </ul>
              {optionalExtras.length > 0 && (
                <div className="mt-4 border-t border-[#222230] pt-3">
                  <p className="text-[11px] font-semibold text-white">Available optional extras (not included)</p>
                  <ul className="mt-2 grid gap-1 text-[10px] text-[#9E9EB2] sm:grid-cols-2">
                    {optionalExtras.map((extra) => (
                      <li key={extra.id} className="flex justify-between gap-2">
                        <span>{extra.name}</span>
                        <span className="font-mono-tabular">{formatInr(Number(extra.priceInr || 0))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-[#242433] bg-[#0D0D14] p-5">
              <label className="block text-xs font-semibold text-white" htmlFor="package-template">
                Preferred template
              </label>
              <select
                id="package-template"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2.5 text-xs text-white"
              >
                {TEMPLATES_DATA.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {formatInr(getProposedTemplatePrice(template.id)?.priceInr || 0)} proposed
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[10px] text-[#8E8EA2]">
                {selectedPrice?.sku} · proposed one-time price {formatInr(selectedPrice?.priceInr || 0)}. In the
                ₹7,999 package this design is included at {formatInr(0)} extra.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-xl border border-[#242433] bg-[#0D0D14] p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <ClipboardList className="h-4 w-4 text-[#D4AF37]" />
                Requirement collection
              </h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8E8EA2]">
                Submit what you need. Nothing is charged automatically. Anything outside the package
                goes to Owner review as a quote-required request.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Business name" value={form.businessName} onChange={(v) => update('businessName', v)} required />
                <Field label="Business category" value={form.businessCategory} onChange={(v) => update('businessCategory', v)} required />
                <Field label="Email address" type="email" value={form.email} onChange={(v) => update('email', v)} required />
                <Field label="Preferred template" value={selectedTemplate.name} readOnly />
                <Field label="Logo & brand colours" value={form.logoBrandColours} onChange={(v) => update('logoBrandColours', v)} placeholder="Logo link / colours" />
                <Field label="Pages required" type="number" min={1} max={30} value={form.pagesRequired} onChange={(v) => update('pagesRequired', v)} />
                <Field label="WhatsApp / contact information" value={form.contactInfo} onChange={(v) => update('contactInfo', v)} required />
                <Field label="Domain preference" value={form.domainPreference} onChange={(v) => update('domainPreference', v)} placeholder="Existing domain / new domain" />
                <Field label="Products or services" value={form.productsServices} onChange={(v) => update('productsServices', v)} placeholder="Short list" />
              </div>
              <label className="mt-3 block text-xs text-[#A7A7B8]">
                Special features required
                <textarea
                  rows={3}
                  value={form.specialFeatures}
                  onChange={(event) => update('specialFeatures', event.target.value)}
                  placeholder="Explain any custom integration, API, migration or extra work"
                  className="mt-1 w-full rounded-md border border-[#292938] bg-[#08080C] px-3 py-2 text-xs text-white placeholder-[#77778B]"
                />
              </label>

              {customCheck.outsidePackage && (
                <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold text-amber-200">
                    <AlertCircle className="h-4 w-4" />
                    {CUSTOM_REQUIREMENT_MESSAGE}
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-[#D8C7A5]">
                    {customCheck.reasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-[#BFAE8C]">
                    No custom price is created automatically. The Owner must review and approve a
                    separate proposal before any extra charge.
                  </p>
                </div>
              )}

              {submitted && (
                <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-200">
                  Requirement saved for Owner review. No payment or extra charge was created.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-3 text-xs font-bold text-[#08080A] disabled:opacity-60"
              >
                {customCheck.outsidePackage
                  ? 'Request Owner Review — Quote Required'
                  : 'Submit Requirement for Owner Review'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <p className="mt-2 text-[10px] text-[#858599]">
                This requirement request does not ask for an OTP, create an account, start payment or
                request an external WhatsApp reply.
              </p>
            </form>

            <div className="grid gap-5 md:grid-cols-2">
              <ListPanel title="Expected milestones" items={PACKAGE_MILESTONES} tone="good" />
              <ListPanel title="Customer responsibilities" items={CUSTOMER_RESPONSIBILITIES} tone="good" />
              <ListPanel title="Not included unless separately purchased" items={PACKAGE_EXCLUSIONS} tone="warn" />
              <div className="rounded-lg border border-[#242433] bg-[#101018] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                  After verified purchase
                </h4>
                <ul className="space-y-2 text-[11px] leading-relaxed text-[#A3A3B5]">
                  <li>Purchased template/package and payment receipt status.</li>
                  <li>Project status and requirement submission status.</li>
                  <li>Pending customer information and approved change requests.</li>
                  <li>Website preview when available, support and handover details.</li>
                  <li>Only your own dashboard and website data is shown.</li>
                </ul>
                <p className="mt-3 flex items-center gap-2 text-[10px] text-[#8E8EA2]">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Role separation is preserved: Owner, Super Admin and Customer remain distinct.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  required,
  type = 'text',
  min,
  max,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-xs text-[#A7A7B8]">
      {label}
      <input
        type={type}
        min={min}
        max={max}
        required={required}
        readOnly={readOnly}
        value={value}
        placeholder={placeholder}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="mt-1 w-full rounded-md border border-[#292938] bg-[#08080C] px-3 py-2 text-xs text-white placeholder-[#77778B]"
      />
    </label>
  );
}

export default PackagePurchaseGuide;
