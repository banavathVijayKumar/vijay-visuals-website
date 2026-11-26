// ============================================================================
// VIJAY VISUALS — PRODUCTION REACT ERROR BOUNDARY & RESILIENT RECOVERY
// - Prevents blank, black, and white screen crashes across the platform.
// - Provides section-level and application-level isolation.
// - Renders a branded recovery UI with Retry and Return Home actions.
// - Exposes ZERO stack traces, secrets, API keys, or database queries to users.
// - Displays official agency support contact: +91 9381362201 / vk66278@gmail.com.
// ============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, Home, RefreshCw, Phone, Mail, MessageCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Safe client-side logging without PII or credential leakage
    console.error(`[VIJAY VISUALS Error Boundary] (${this.props.sectionName || 'Root'}):`, {
      message: error.message,
      name: error.name,
      errorId: this.state.errorId,
      componentStack: errorInfo.componentStack?.slice(0, 300),
    });
  }

  handleRetry = (): void => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch {}
    }
    this.setState({
      hasError: false,
      error: null,
      errorId: '',
    });
  };

  handleGoHome = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { sectionName, fallbackTitle } = this.props;
    const isRoot = !sectionName || sectionName === 'Root' || sectionName === 'Application Recovery';

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`w-full flex items-center justify-center p-4 sm:p-6 ${
          isRoot ? 'min-h-screen bg-[#08080C]' : 'min-h-[320px] bg-[#0E0E14] rounded-2xl border border-[#26263A] my-4'
        }`}
      >
        <div className="max-w-lg w-full bg-[#12121A] border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
          {/* Brand & Status Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/30">
              SERVICE RECOVERY
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {fallbackTitle || `${sectionName || 'Application'} Temporarily Unavailable`}
            </h2>
            <p className="text-xs sm:text-sm text-[#A0A0B8] max-w-md mx-auto leading-relaxed">
              We encountered an unexpected display issue while rendering this section.
              Your data and account remain safe. You can reload this view or return to the main platform.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ECC86A] via-[#D4AF37] to-[#B89628] text-black text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A26] border border-[#2C2C3E] text-white text-xs font-semibold hover:bg-[#252536] hover:border-[#D4AF37]/50 active:scale-95 transition-all"
            >
              <Home className="w-3.5 h-3.5 text-amber-300" />
              <span>Return to Home</span>
            </button>
          </div>

          {/* Official Agency Support Strip */}
          <div className="border-t border-[#202030] pt-4 mt-4 text-[11px] text-[#8E8EA2] space-y-2">
            <div className="font-semibold text-white">Need immediate technical assistance?</div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <a
                href="tel:+919381362201"
                className="inline-flex items-center gap-1.5 text-white hover:text-amber-300 transition-colors"
              >
                <Phone className="w-3 h-3 text-amber-400" />
                <span>+91 9381362201</span>
              </a>
              <span className="text-[#3A3A4E]">·</span>
              <a
                href="https://wa.me/919381362201"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-white hover:text-emerald-400 transition-colors"
              >
                <MessageCircle className="w-3 h-3 text-emerald-400" />
                <span>WhatsApp</span>
              </a>
              <span className="text-[#3A3A4E]">·</span>
              <a
                href="mailto:vk66278@gmail.com"
                className="inline-flex items-center gap-1.5 text-white hover:text-amber-300 transition-colors"
              >
                <Mail className="w-3 h-3 text-amber-400" />
                <span>vk66278@gmail.com</span>
              </a>
            </div>
            {this.state.errorId && (
              <div className="text-[10px] text-[#6A6A80] font-mono pt-1">
                Reference Code: {this.state.errorId}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
