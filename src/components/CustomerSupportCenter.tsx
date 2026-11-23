import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCode,
  FileText,
  Filter,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export interface SupportTicket {
  id: number;
  ticketNumber: string;
  websiteId: string;
  ownerId: string;
  subject: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'review' | 'completed' | 'closed';
  messages: Array<{
    sender: string;
    senderName?: string;
    text: string;
    at: string;
    attachments?: string[];
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteChangeRequest {
  id: number;
  requestNumber: string;
  websiteId: string;
  category: string;
  isBugFix: boolean;
  title: string;
  description: string;
  attachments: string[];
  aiSummary: string;
  quotationInr: number;
  estimatedHours: number;
  deliveryDays: number;
  status: 'submitted' | 'under_review' | 'quoted' | 'approved' | 'rejected' | 'in_progress' | 'review_ready' | 'completed' | 'cancelled';
  customerNotes?: string;
  adminNotes?: string;
  approvedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperTask {
  id: number;
  taskNumber: string;
  websiteId: string;
  businessName: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assignedDeveloperName: string;
  estimatedHours: number;
  actualHours: number;
  deadline?: string;
  isOverdue: boolean;
  internalNotes: string;
  createdAt: string;
}

interface CustomerSupportCenterProps {
  tenantId: number;
  websiteId?: string;
  userRole?: string;
  onNotify: (msg: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  design_changes: 'Website Design Changes',
  logo_banner: 'Logo & Banner Changes',
  product_content: 'Product & Content Updates',
  new_page: 'New Page Creation',
  website_redesign: 'Website Redesign',
  domain_dns: 'Domain & DNS Issues',
  payment_gateway: 'Payment Gateway Issues',
  checkout_orders: 'Orders & Checkout Issues',
  technical_bugs: 'Technical Bugs',
  security_problems: 'Security Problems',
  feature_request: 'New Feature Request',
  general_assistance: 'General Assistance',
  bug_fix: 'Bug Fix / QA (Free)',
  custom_feature: 'Custom Development',
};

export const CustomerSupportCenter: React.FC<CustomerSupportCenterProps> = ({
  tenantId,
  websiteId,
  userRole,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'change_requests' | 'developer_tasks'>('tickets');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [changeRequests, setChangeRequests] = useState<WebsiteChangeRequest[]>([]);
  const [developerTasks, setDeveloperTasks] = useState<DeveloperTask[]>([]);
  const [loading, setLoading] = useState(false);

  // Ticket creation form
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [tktSubject, setTktSubject] = useState('');
  const [tktCategory, setTktCategory] = useState('design_changes');
  const [tktPriority, setTktPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [tktMessage, setTktMessage] = useState('');
  const [tktAttachment, setTktAttachment] = useState('');

  // Selected ticket for conversation
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachment, setReplyAttachment] = useState('');

  // Change request form
  const [newCrOpen, setNewCrOpen] = useState(false);
  const [crTitle, setCrTitle] = useState('');
  const [crCategory, setCrCategory] = useState('design_changes');
  const [crDescription, setCrDescription] = useState('');
  const [crAttachment, setCrAttachment] = useState('');

  // Developer Task Form (Staff only)
  const [newDevTaskOpen, setNewDevTaskOpen] = useState(false);
  const [dtTitle, setDtTitle] = useState('');
  const [dtDevName, setDtDevName] = useState('Vijay Visuals Senior Engineer');
  const [dtEstHours, setDtEstHours] = useState(4);
  const [dtPriority, setDtPriority] = useState('normal');
  const [dtDeadline, setDtDeadline] = useState('');

  const isStaff = userRole === 'admin' || userRole === 'super_admin' || userRole === 'platform_staff';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, crRes] = await Promise.all([
        apiFetch<{ tickets: SupportTicket[] }>(`/api/tickets?tenantId=${tenantId}`),
        apiFetch<{ requests: WebsiteChangeRequest[] }>(`/api/owner/tenants/${tenantId}/change-requests`),
      ]);
      setTickets(tRes.tickets || []);
      setChangeRequests(crRes.requests || []);

      if (isStaff) {
        try {
          const dtRes = await apiFetch<{ tasks: DeveloperTask[] }>('/api/admin/developer-tasks');
          setDeveloperTasks(dtRes.tasks || []);
        } catch {}
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load support center data.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, isStaff, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Create Ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tktSubject.trim() || !tktMessage.trim()) return;
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: tktSubject.trim(),
          category: tktCategory,
          priority: tktPriority,
          message: tktMessage.trim(),
          tenantId,
          websiteId,
          attachments: tktAttachment.trim() ? [tktAttachment.trim()] : [],
        }),
      });
      setTktSubject('');
      setTktMessage('');
      setTktAttachment('');
      setNewTicketOpen(false);
      await loadData();
      onNotify(`Support ticket ${res.ticket.ticketNumber} created successfully.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create ticket.');
    }
  };

  // Handle Reply to Ticket
  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;
    try {
      await apiFetch('/api/tickets', {
        method: 'PATCH',
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          message: replyMessage.trim(),
          attachments: replyAttachment.trim() ? [replyAttachment.trim()] : [],
        }),
      });
      setReplyMessage('');
      setReplyAttachment('');
      await loadData();
      // Update selected ticket in view
      const updatedRes = await apiFetch<{ tickets: SupportTicket[] }>(`/api/tickets?tenantId=${tenantId}`);
      const refreshed = (updatedRes.tickets || []).find((t) => t.id === selectedTicket.id);
      if (refreshed) setSelectedTicket(refreshed);
      onNotify('Reply sent.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to send reply.');
    }
  };

  // Handle Submit Change Request
  const handleCreateChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crTitle.trim() || !crDescription.trim()) return;
    try {
      const res = await apiFetch<{ changeRequest: WebsiteChangeRequest }>(
        `/api/owner/tenants/${tenantId}/change-requests`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: crTitle.trim(),
            category: crCategory,
            description: crDescription.trim(),
            attachments: crAttachment.trim() ? [crAttachment.trim()] : [],
          }),
        }
      );
      setCrTitle('');
      setCrDescription('');
      setCrAttachment('');
      setNewCrOpen(false);
      await loadData();
      onNotify(
        `Change request ${res.changeRequest.requestNumber} submitted. Classified as ${
          res.changeRequest.isBugFix ? 'Quality Assurance (Free Bug Fix)' : 'Feature Quotation'
        }.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to submit change request.');
    }
  };

  // Handle Approve / Reject Quotation
  const handleQuotationDecision = async (requestId: number, decision: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/api/owner/tenants/${tenantId}/change-requests`, {
        method: 'PATCH',
        body: JSON.stringify({ requestId, decision }),
      });
      await loadData();
      onNotify(`Quotation ${decision === 'approved' ? 'Approved' : 'Rejected'}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update quotation decision.');
    }
  };

  // Handle Create Developer Task
  const handleCreateDevTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dtTitle.trim()) return;
    try {
      await apiFetch('/api/admin/developer-tasks', {
        method: 'POST',
        body: JSON.stringify({
          websiteId: websiteId || `tenant_${tenantId}`,
          title: dtTitle.trim(),
          assignedDeveloperName: dtDevName.trim(),
          estimatedHours: dtEstHours,
          priority: dtPriority,
          deadline: dtDeadline || null,
        }),
      });
      setDtTitle('');
      setNewDevTaskOpen(false);
      await loadData();
      onNotify('Developer task assigned.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to assign developer task.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#D4AF37] font-medium">Modules 3, 4 & 5 · Customer Support, Changes & Developer Ops</p>
            <h2 className="font-luxury text-xl font-bold text-white mt-0.5">
              Customer Support Center & Quotation Management
            </h2>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2A2A3A] bg-[#12121A] text-xs text-[#A3A3B5] hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#1C1C28] pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              activeTab === 'tickets' ? 'bg-[#D4AF37] text-[#08080A]' : 'bg-[#12121A] text-[#A3A3B5]'
            }`}
          >
            Support Tickets ({tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('change_requests')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              activeTab === 'change_requests' ? 'bg-[#D4AF37] text-[#08080A]' : 'bg-[#12121A] text-[#A3A3B5]'
            }`}
          >
            Change Requests & Quotations ({changeRequests.length})
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => setActiveTab('developer_tasks')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                activeTab === 'developer_tasks' ? 'bg-[#D4AF37] text-[#08080A]' : 'bg-[#12121A] text-[#A3A3B5]'
              }`}
            >
              Developer Task Queue ({developerTasks.length})
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SUPPORT TICKETS */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Active Support Tickets</h3>
            <button
              type="button"
              onClick={() => setNewTicketOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Raise Support Ticket</span>
            </button>
          </div>

          {tickets.length === 0 ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-xs text-[#8E8EA2] space-y-2">
              <MessageSquare className="w-8 h-8 text-[#545468] mx-auto" />
              <p>No support tickets raised yet. Have a question or issue? Click above to raise a ticket.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 gap-5">
              {/* Tickets List */}
              <div className="lg:col-span-5 space-y-2.5 max-h-[600px] overflow-y-auto">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`rounded-lg border p-3.5 text-xs cursor-pointer transition-colors ${
                      selectedTicket?.id === t.id
                        ? 'border-[#D4AF37] bg-[#19170E]'
                        : 'border-[#1E1E2B] bg-[#09090D] hover:border-[#2D2D40]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono-tabular text-[#ECC86A] font-semibold">{t.ticketNumber}</span>
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[10px] font-medium ${
                          t.status === 'open'
                            ? 'bg-amber-950/30 text-amber-300 border border-amber-500/30'
                            : t.status === 'in_progress'
                            ? 'bg-blue-950/30 text-blue-300 border border-blue-500/30'
                            : t.status === 'completed' || t.status === 'closed'
                            ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-500/30'
                            : 'bg-purple-950/30 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="font-semibold text-white truncate">{t.subject}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#8E8EA2] mt-1.5">
                      <span>{CATEGORY_LABELS[t.category] || t.category}</span>
                      <span className="uppercase text-[#B8B8C8]">{t.priority}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ticket Conversation View */}
              <div className="lg:col-span-7 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-col justify-between min-h-[450px]">
                {selectedTicket ? (
                  <div className="space-y-4 flex flex-col h-full">
                    <div className="border-b border-[#1E1E2B] pb-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-xs text-[#ECC86A]">{selectedTicket.ticketNumber}</span>
                        <span className="text-[11px] text-[#8E8EA2]">
                          Created: {new Date(selectedTicket.createdAt).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{selectedTicket.subject}</h4>
                      <p className="text-[11px] text-[#A5A5B8]">
                        Category: {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category} · Priority: {selectedTicket.priority}
                      </p>
                    </div>

                    {/* Messages Thread */}
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1">
                      {selectedTicket.messages.map((m, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-3 text-xs space-y-1.5 ${
                            m.sender.includes('vijayvisuals') || m.senderName?.includes('Support')
                              ? 'bg-[#15130A] border border-[#D4AF37]/30 ml-4'
                              : 'bg-[#0A0A0E] border border-[#1E1E2A] mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-[#8E8EA2]">
                            <span className="font-semibold text-[#DDDDE8]">{m.senderName || m.sender}</span>
                            <span>{new Date(m.at).toLocaleTimeString('en-IN')}</span>
                          </div>
                          <p className="text-white whitespace-pre-wrap leading-relaxed">{m.text}</p>
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1 border-t border-[#1C1C26]">
                              {m.attachments.map((url, aIdx) => (
                                <a
                                  key={aIdx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-[#ECC86A] underline"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  <span>Attachment {aIdx + 1}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Reply Box */}
                    <form onSubmit={handleReplyTicket} className="space-y-2 pt-3 border-t border-[#1E1E2B]">
                      <textarea
                        rows={2}
                        required
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type reply or request clarification..."
                        className="w-full rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="url"
                          value={replyAttachment}
                          onChange={(e) => setReplyAttachment(e.target.value)}
                          placeholder="Attachment URL (Screenshot / PDF)"
                          className="flex-1 rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-1.5 text-xs text-white"
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
                        >
                          <Send className="w-3 h-3" />
                          <span>Reply</span>
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="m-auto text-center text-xs text-[#7A7A8E]">
                    <MessageSquare className="w-6 h-6 mx-auto mb-2 text-[#444458]" />
                    <span>Select a ticket from the left to view the conversation and reply.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHANGE REQUESTS & QUOTATIONS */}
      {activeTab === 'change_requests' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-white">Website Change Requests & Technical Quotations</h3>
              <p className="text-xs text-[#8E8EA2]">
                Request website design, layout or custom features. Free bug fixes are identified at ₹0 cost.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewCrOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Request Website Change</span>
            </button>
          </div>

          {changeRequests.length === 0 ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-xs text-[#8E8EA2] space-y-2">
              <FileCode className="w-8 h-8 text-[#545468] mx-auto" />
              <p>No change requests submitted. Need new sections, custom banners, or product layouts? Click above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {changeRequests.map((cr) => (
                <div key={cr.id} className="rounded-xl border border-[#1E1E2B] bg-[#09090D] p-4 text-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A1A26] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-[#ECC86A] font-bold">{cr.requestNumber}</span>
                      <span className="font-semibold text-white text-sm">{cr.title}</span>
                      {cr.isBugFix ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/40 text-emerald-300 border border-emerald-500/40 font-medium">
                          Free Bug Fix (₹0)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/40 text-amber-300 border border-amber-500/40 font-medium">
                          Feature Request
                        </span>
                      )}
                    </div>
                    <span className="capitalize px-2.5 py-1 rounded text-[10px] font-semibold border border-[#2A2A3A] bg-[#12121A] text-[#DDDDE8]">
                      {cr.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <p className="text-[#C4C4D4] leading-relaxed">{cr.description}</p>

                  {cr.aiSummary && (
                    <div className="rounded-md border border-[#D4AF37]/25 bg-[#121008] p-2.5 text-[11px] text-[#F0D58C] flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                      <div>
                        <strong>AI Classification & Scope: </strong>
                        <span>{cr.aiSummary}</span>
                      </div>
                    </div>
                  )}

                  {/* Quotation Details & Approval Section */}
                  <div className="rounded-lg border border-[#20202E] bg-[#0E0E14] p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-[11px]">
                      <div>
                        <span className="text-[#8E8EA2]">Estimated Cost: </span>
                        <strong className="text-white text-xs">
                          {cr.isBugFix ? '₹0 (Free QA)' : cr.quotationInr > 0 ? `₹${cr.quotationInr.toLocaleString('en-IN')}` : 'Awaiting Review'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#8E8EA2]">Estimated Turnaround: </span>
                        <strong className="text-white text-xs">{cr.deliveryDays} Day(s) ({cr.estimatedHours} hrs)</strong>
                      </div>
                    </div>

                    {cr.status === 'quoted' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuotationDecision(cr.id, 'approved')}
                          className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                        >
                          Approve Quotation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuotationDecision(cr.id, 'rejected')}
                          className="px-3 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-950/20"
                        >
                          Decline
                        </button>
                      </div>
                    )}

                    {cr.status === 'approved' && (
                      <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Quotation Approved · Work Commenced</span>
                      </span>
                    )}

                    {cr.status === 'review_ready' && (
                      <span className="text-purple-300 font-semibold text-[11px] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Ready for Customer Review</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEVELOPER TASKS (STAFF ONLY) */}
      {isStaff && activeTab === 'developer_tasks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-white">Internal Developer Tasks</h3>
              <p className="text-xs text-[#8E8EA2]">Assign developer work hours, track deadlines and monitor progress.</p>
            </div>
            <button
              type="button"
              onClick={() => setNewDevTaskOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Assign Developer Task</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {developerTasks.map((dt) => (
              <div key={dt.id} className="rounded-lg border border-[#1E1E2A] bg-[#09090D] p-3.5 text-xs flex justify-between items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-[#ECC86A] font-bold">{dt.taskNumber}</span>
                    <span className="font-semibold text-white">{dt.title}</span>
                    {dt.isOverdue && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/40 text-rose-300 border border-rose-500/40">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8E8EA2]">
                    Developer: <span className="text-[#DDDDE8]">{dt.assignedDeveloperName}</span> · Logged: {dt.actualHours}/{dt.estimatedHours} hrs
                  </p>
                </div>
                <span className="capitalize px-2.5 py-1 rounded text-[10px] font-semibold border border-[#2A2A38] bg-[#12121A] text-[#DDDDE8]">
                  {dt.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: RAISE TICKET */}
      {newTicketOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#2E2E3F] bg-[#0D0D14] p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1E1E2B] pb-3">
              <h3 className="font-luxury text-base font-bold text-white">Raise Customer Support Ticket</h3>
              <button type="button" onClick={() => setNewTicketOpen(false)} className="text-[#8E8EA2] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9E9EB2] mb-1">Support Category</label>
                <select
                  value={tktCategory}
                  onChange={(e) => setTktCategory(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={tktSubject}
                  onChange={(e) => setTktSubject(e.target.value)}
                  placeholder="e.g. Logo change request or Payment gateway webhook issue"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Priority</label>
                <select
                  value={tktPriority}
                  onChange={(e) => setTktPriority(e.target.value as any)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                >
                  <option value="low">Low — General inquiry</option>
                  <option value="normal">Normal — Standard request</option>
                  <option value="high">High — Checkout or display issue</option>
                  <option value="urgent">Urgent — Store offline</option>
                </select>
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Detailed Explanation</label>
                <textarea
                  rows={4}
                  required
                  value={tktMessage}
                  onChange={(e) => setTktMessage(e.target.value)}
                  placeholder="Please describe the issue or change in detail..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Screenshot / Asset URL (Optional)</label>
                <input
                  type="url"
                  value={tktAttachment}
                  onChange={(e) => setTktAttachment(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1E1E2B]">
                <button
                  type="button"
                  onClick={() => setNewTicketOpen(false)}
                  className="px-4 py-2 rounded-md border border-[#2A2A38] text-[#8E8EA2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT CHANGE REQUEST */}
      {newCrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#2E2E3F] bg-[#0D0D14] p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1E1E2B] pb-3">
              <h3 className="font-luxury text-base font-bold text-white">Request Website Change / Feature</h3>
              <button type="button" onClick={() => setNewCrOpen(false)} className="text-[#8E8EA2] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateChangeRequest} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9E9EB2] mb-1">Change Scope</label>
                <select
                  value={crCategory}
                  onChange={(e) => setCrCategory(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                >
                  <option value="design_changes">Design / Theme Changes</option>
                  <option value="new_page">Add New Page</option>
                  <option value="logo_banner">Replace Banners / Logo</option>
                  <option value="product_content">Upload / Format Products</option>
                  <option value="custom_feature">Custom Development Feature</option>
                  <option value="bug_fix">Bug Fix (Free QA)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Request Title</label>
                <input
                  type="text"
                  required
                  value={crTitle}
                  onChange={(e) => setCrTitle(e.target.value)}
                  placeholder="e.g. Add Festive Collection Slider to Homepage"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Detailed Technical Requirements</label>
                <textarea
                  rows={4}
                  required
                  value={crDescription}
                  onChange={(e) => setCrDescription(e.target.value)}
                  placeholder="Specify sections, styling, images and functionality needed..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Mockup / Reference Asset URL</label>
                <input
                  type="url"
                  value={crAttachment}
                  onChange={(e) => setCrAttachment(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1E1E2B]">
                <button
                  type="button"
                  onClick={() => setNewCrOpen(false)}
                  className="px-4 py-2 rounded-md border border-[#2A2A38] text-[#8E8EA2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                >
                  Submit for Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN DEVELOPER TASK (STAFF) */}
      {newDevTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#2E2E3F] bg-[#0D0D14] p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1E1E2B] pb-3">
              <h3 className="font-luxury text-base font-bold text-white">Assign Internal Developer Task</h3>
              <button type="button" onClick={() => setNewDevTaskOpen(false)} className="text-[#8E8EA2] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDevTask} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9E9EB2] mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={dtTitle}
                  onChange={(e) => setDtTitle(e.target.value)}
                  placeholder="e.g. Implement custom banner animation for SVS"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Assignee Developer</label>
                <input
                  type="text"
                  required
                  value={dtDevName}
                  onChange={(e) => setDtDevName(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9E9EB2] mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={dtEstHours}
                    onChange={(e) => setDtEstHours(Number(e.target.value))}
                    className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[#9E9EB2] mb-1">Priority</label>
                  <select
                    value={dtPriority}
                    onChange={(e) => setDtPriority(e.target.value)}
                    className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#9E9EB2] mb-1">Deadline Date</label>
                <input
                  type="date"
                  value={dtDeadline}
                  onChange={(e) => setDtDeadline(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1E1E2B]">
                <button
                  type="button"
                  onClick={() => setNewDevTaskOpen(false)}
                  className="px-4 py-2 rounded-md border border-[#2A2A38] text-[#8E8EA2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
