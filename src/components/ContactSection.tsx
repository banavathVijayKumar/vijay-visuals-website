import React, { useState } from 'react';
import { CONTACT_INFO, SERVICES_DATA } from '../data/content';
import { MessageCircle, Mail, Instagram, Copy, Check, Send, Phone, MapPin, Clock, Sparkles } from 'lucide-react';

interface ContactSectionProps {
  onShowToast: (msg: string) => void;
}

export const ContactSection: React.FC<ContactSectionProps> = ({ onShowToast }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service: 'Website Development',
    budget: '₹25,000 - ₹50,000',
    timeline: 'Within 2-3 Weeks',
    details: '',
  });

  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(CONTACT_INFO.email);
    setCopiedEmail(true);
    onShowToast('Email address copied to clipboard!');
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(CONTACT_INFO.whatsappDisplay);
    setCopiedPhone(true);
    onShowToast('WhatsApp phone number copied to clipboard!');
    setTimeout(() => setCopiedPhone(false), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      onShowToast('Please provide your name and phone number so Vijay can reach you.');
      return;
    }

    setIsSubmitting(true);

    // Format WhatsApp inquiry text
    const message = `*New Project Inquiry for Vijay Visuals:*
*Name:* ${formData.name}
*Phone/WhatsApp:* ${formData.phone}
*Email:* ${formData.email || 'Not provided'}
*Service:* ${formData.service}
*Budget Range:* ${formData.budget}
*Timeline:* ${formData.timeline}
*Project Details:* ${formData.details || 'To be discussed'}`;

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmittedSuccess(true);
      onShowToast('Inquiry generated! Opening WhatsApp with your prefilled details.');
      window.open(`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    }, 600);
  };

  return (
    <section id="contact" className="py-24 relative bg-[#09090D] overflow-hidden">
      {/* Subtle luxury ambient backlights */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Header */}
        <div className="max-w-3xl mb-16">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
            <span>Direct Inquiries</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#888898]">Initiate Your Commission</span>
          </div>
          <h2 className="font-luxury text-3xl sm:text-4xl lg:text-[2.6rem] font-bold text-white tracking-tight leading-tight text-balance">
            Let’s Build Something Iconic Together.
          </h2>
          <p className="text-[#9E9EAF] text-sm sm:text-base mt-4 leading-relaxed">
            Connect directly with Vijay for project estimates, custom video editing turnaround dates, and high-performance web consulting.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Left Column: Direct Communication Cards */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Primary Channel: WhatsApp */}
            <div className="bg-[#0F0F16] border border-[#2D2D3E] hover:border-[#D4AF37]/60 rounded-xl p-6 transition-all shadow-xl group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#25D366]/20 to-[#128C7E]/10 border border-[#25D366]/30 flex items-center justify-center text-[#25D366]">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-[#25D366] uppercase tracking-wider block font-semibold">
                      Fastest Response (Under 15 Mins)
                    </span>
                    <h3 className="font-luxury text-lg font-bold text-white mt-0.5">
                      WhatsApp Chat & Call
                    </h3>
                  </div>
                </div>

                <button
                  onClick={handleCopyPhone}
                  className="p-2 text-[#7F7F92] hover:text-white rounded-md hover:bg-[#1A1A26] transition-colors"
                  title="Copy Phone Number"
                  aria-label="Copy Phone Number"
                >
                  {copiedPhone ? <Check className="w-4 h-4 text-[#DFBA5A]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <p className="font-mono text-base font-bold text-white mt-4 tracking-wide">
                {CONTACT_INFO.whatsappDisplay}
              </p>

              <div className="mt-4 pt-4 border-t border-[#1C1C28] flex items-center gap-3">
                <a
                  href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to discuss a project with Vijay Visuals.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-md shadow-[#D4AF37]/15"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Start WhatsApp Chat</span>
                </a>
              </div>
            </div>

            {/* Email Channel */}
            <div className="bg-[#0F0F16] border border-[#232332] hover:border-[#D4AF37]/40 rounded-xl p-6 transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#161622] border border-[#2B2B3C] flex items-center justify-center text-[#DFBA5A]">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-[#8C8C9E] uppercase tracking-wider block">
                      Formal RFPs & Briefs
                    </span>
                    <h3 className="font-luxury text-lg font-bold text-white mt-0.5">
                      Direct Email Inbox
                    </h3>
                  </div>
                </div>

                <button
                  onClick={handleCopyEmail}
                  className="p-2 text-[#7F7F92] hover:text-white rounded-md hover:bg-[#1A1A26] transition-colors"
                  title="Copy Email"
                  aria-label="Copy Email"
                >
                  {copiedEmail ? <Check className="w-4 h-4 text-[#DFBA5A]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <p className="font-mono text-sm text-[#D1D1DE] mt-4 select-all">
                {CONTACT_INFO.email}
              </p>

              <div className="mt-4 pt-4 border-t border-[#1C1C28]">
                <a
                  href={`mailto:${CONTACT_INFO.email}?subject=Project%20Inquiry%20-%20Vijay%20Visuals`}
                  className="inline-flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline font-semibold"
                >
                  <span>Open Email Client</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

            {/* Instagram Channel */}
            <div className="bg-[#0F0F16] border border-[#232332] hover:border-[#D4AF37]/40 rounded-xl p-6 transition-all group">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#833AB4]/20 via-[#FD1D1D]/15 to-[#F77737]/10 border border-[#FD1D1D]/30 flex items-center justify-center text-[#F77737]">
                  <Instagram className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-mono text-[#8C8C9E] uppercase tracking-wider block">
                    Behind-the-Scenes & Reels
                  </span>
                  <h3 className="font-luxury text-lg font-bold text-white mt-0.5">
                    Official Instagram
                  </h3>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#1C1C28] flex items-center justify-between">
                <span className="font-mono text-xs text-[#A5A5B8]">@{CONTACT_INFO.instagram}</span>
                <a
                  href={CONTACT_INFO.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#ECC86A] hover:underline font-semibold"
                >
                  <span>Follow & DM</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

            {/* Studio Availability Status */}
            <div className="bg-[#0B0B10] border border-[#1E1E28] p-4 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-[#DFBA5A] font-semibold">
                <Clock className="w-4 h-4" />
                <span>Current Studio Availability</span>
              </div>
              <p className="text-[#878799] leading-relaxed">
                Now accepting commissions for Q4 and next quarter. Urgent rush edits and express 72h web builds available on inquiry.
              </p>
            </div>

          </div>

          {/* Right Column: Interactive Proposal & Inquiry Form */}
          <div className="lg:col-span-7 bg-[#0E0E15] border border-[#262635] rounded-xl p-6 sm:p-8 shadow-2xl relative">
            
            <div className="border-b border-[#1E1E2A] pb-4 mb-6">
              <span className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider block">
                Direct Submission
              </span>
              <h3 className="font-luxury text-2xl font-bold text-white mt-1">
                Project Inquiry Form
              </h3>
              <p className="text-xs text-[#8C8C9E] mt-1">
                Fill out your details below to generate a formatted WhatsApp message or send an instant brief.
              </p>
            </div>

            {submittedSuccess ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#18261A] border border-[#25D366]/40 flex items-center justify-center text-[#25D366]">
                  <Check className="w-7 h-7" />
                </div>
                <h4 className="font-luxury text-2xl font-bold text-white">
                  Inquiry Ready!
                </h4>
                <p className="text-xs sm:text-sm text-[#A0A0B2] max-w-md mx-auto leading-relaxed">
                  Your project specifications have been formatted. If WhatsApp did not open automatically, click the button below to message Vijay directly.
                </p>
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(`Hello Vijay, I am following up on my inquiry from ${formData.name} for ${formData.service}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 py-3 px-6 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] rounded-md shadow-lg"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Open WhatsApp Now</span>
                  </a>
                  <button
                    onClick={() => setSubmittedSuccess(false)}
                    className="text-xs text-[#8E8EA0] hover:text-white px-4 py-2"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div>
                    <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                      Your Name / Company <span className="text-[#D4AF37]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs placeholder:text-[#636374] focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Phone / WhatsApp */}
                  <div>
                    <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                      WhatsApp / Phone Number <span className="text-[#D4AF37]">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs placeholder:text-[#636374] focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="your.email@domain.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs placeholder:text-[#636374] focus:outline-none transition-colors"
                  />
                </div>

                {/* Service Selection */}
                <div>
                  <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                    Desired Service Discipline <span className="text-[#D4AF37]">*</span>
                  </label>
                  <select
                    value={formData.service}
                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs focus:outline-none transition-colors"
                  >
                    {SERVICES_DATA.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.number}. {s.title}
                      </option>
                    ))}
                    <option value="Combined Multi-Service Package">Combined Package (Web + Video + Branding)</option>
                  </select>
                </div>

                {/* Budget & Timeline Split */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                      Budget Range
                    </label>
                    <select
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs focus:outline-none transition-colors"
                    >
                      <option value="Under ₹25,000">Under ₹25,000</option>
                      <option value="₹25,000 - ₹50,000">₹25,000 - ₹50,000</option>
                      <option value="₹50,000 - ₹1,00,000">₹50,000 - ₹1,00,000</option>
                      <option value="₹1,00,000+ Enterprise">₹1,00,000+ (High-End Bespoke)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                      Target Timeline
                    </label>
                    <select
                      value={formData.timeline}
                      onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs focus:outline-none transition-colors"
                    >
                      <option value="Rush (Within 48-72 Hours)">Rush (Within 48-72 Hours)</option>
                      <option value="Within 1-2 Weeks">Within 1-2 Weeks</option>
                      <option value="Within 1 Month">Within 1 Month</option>
                      <option value="Flexible Timeline">Flexible Timeline</option>
                    </select>
                  </div>
                </div>

                {/* Details */}
                <div>
                  <label className="text-xs font-medium text-[#C8C8D6] block mb-1.5">
                    Brief Project Details & Scope
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Describe your vision, wedding event date, footage duration, or website goals..."
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] focus:border-[#D4AF37] text-white text-xs placeholder:text-[#636374] focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-6 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-lg shadow-[#D4AF37]/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{isSubmitting ? 'Formatting Brief...' : 'Send Inquiry to Vijay on WhatsApp'}</span>
                  </button>
                  <p className="text-[11px] text-[#6E6E80] text-center mt-2">
                    Takes only a few seconds. We respect your confidentiality.
                  </p>
                </div>

              </form>
            )}

          </div>

        </div>

      </div>
    </section>
  );
};
