import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const STATE_KEY = 'nutrifit_dz_state_v2';
const TOKEN_KEY = 'nf_auth_token';

/**
 * Keeps a render-time failure inside one readable, recoverable screen instead of
 * unmounting the whole tree and leaving an empty document.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[nutrifit-render-error]', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  private handleReset = (): void => {
    try {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage failures; a reload still rebuilds a clean session.
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#09090b] text-[#f3f1ec] flex items-center justify-center px-4 py-10"
      >
        <div className="w-full max-w-md rounded-3xl border border-[#b86157]/45 bg-[#111114] p-6 space-y-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#b86157]/45 bg-[#1a1111] text-[#b86157]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[.2em] text-[#c8a96e]">
                NUTRIFIT DZ
              </div>
              <h1 className="mt-1 text-lg font-bold leading-relaxed">
                توقّفت الشاشة عن الاستجابة
              </h1>
            </div>
          </div>

          <p className="text-xs leading-7 text-[#96938a]">
            حدث خطأ أثناء عرض هذا الجزء من التطبيق. بياناتك المحفوظة لم تُحذف. يمكنك إعادة
            المحاولة أولًا؛ وإن تكرر الخطأ، صفّر البيانات المحلية للعودة إلى إعدادات البداية.
          </p>

          <div className="rounded-2xl border border-[#232329] bg-[#18181c] p-3">
            <div className="text-[10px] font-bold text-[#66645e]">تفاصيل تقنية</div>
            <p
              dir="ltr"
              className="mt-1 max-h-32 overflow-y-auto text-left text-[11px] leading-6 text-[#c89a56] break-words"
            >
              {error.message || 'خطأ غير معروف'}
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={this.handleRetry}
              className="touch-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#e6d1a3] to-[#c8a96e] px-5 text-sm font-bold text-[#141108] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="touch-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#3d2321] bg-[#1a1111] px-5 text-xs font-bold text-[#b86157] cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              تصفير البيانات المحلية وإعادة التحميل
            </button>
          </div>
        </div>
      </main>
    );
  }
}
