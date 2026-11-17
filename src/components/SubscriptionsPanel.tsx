import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import { formatArabicDate } from '../utils/nutrition';

interface SubscriptionRow {
  id: string;
  status: 'active' | 'cancelled';
  start_date: string;
  end_date: string;
  meal_count: number;
  orders_count: number;
}

interface SubscriptionsPanelProps {
  authToken?: string;
  refreshKey: number;
  onToast: (msg: string) => void;
  onCancelled: (subscriptionId: string) => void;
}

export const SubscriptionsPanel: React.FC<SubscriptionsPanelProps> = ({
  authToken,
  refreshKey,
  onToast,
  onCancelled,
}) => {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authToken) return;
    try {
      const data = await apiRequest<{ subscriptions: SubscriptionRow[] }>('/api/subscriptions', authToken);
      setRows(data.subscriptions);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'تعذر تحميل الاشتراكات.');
    }
  }, [authToken]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const cancel = async (id: string) => {
    if (!authToken || busyId) return;
    setBusyId(id);
    try {
      const result = await apiRequest<{ cancelled: boolean; ordersCancelled: number }>(
        '/api/subscriptions/' + id + '/cancel',
        authToken,
        { method: 'POST' }
      );
      onCancelled(id);
      onToast(`أُلغي الاشتراك وأُلغيت ${result.ordersCancelled} أيام قادمة. الأيام التي مرّت مهلتها (24 ساعة) تبقى كما هي.`);
      setConfirmId(null);
      await load();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'تعذر إلغاء الاشتراك.');
    } finally {
      setBusyId(null);
    }
  };

  if (!authToken || (rows.length === 0 && !loadError)) return null;

  return (
    <div className="bg-[#111114] border border-[#232329] rounded-2xl p-4 sm:p-5 space-y-3">
      <h2 className="text-sm font-bold text-[#f3f1ec]">اشتراكاتي</h2>
      {loadError && <div className="text-xs text-[#c89a56]">{loadError}</div>}
      {rows.map((row) => {
        const active = row.status === 'active';
        return (
          <div key={row.id} className="bg-[#18181c] border border-[#232329] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#f3f1ec]">
                  {formatArabicDate(row.start_date)} ← {formatArabicDate(row.end_date)}
                </div>
                <div className="text-[11px] text-[#96938a] mt-0.5">
                  {row.meal_count} وجبات يومياً · {row.orders_count} أيام محجوزة
                </div>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                  active
                    ? 'bg-[#242117] border-[#c8a96e]/40 text-[#e6d1a3]'
                    : 'bg-[#111114] border-[#232329] text-[#66645e]'
                }`}
              >
                {active ? 'نشط' : 'ملغى'}
              </span>
            </div>
            {active &&
              (confirmId === row.id ? (
                <div className="space-y-2">
                  <p className="text-[11px] leading-5 text-[#c89a56]">
                    سيُلغى كل يوم قادم يبعد 24 ساعة أو أكثر. هل تريد المتابعة؟
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void cancel(row.id)}
                      className="touch-press min-h-11 rounded-xl bg-[#1a1111] border border-[#b86157]/60 text-xs font-bold text-[#f3f1ec] cursor-pointer disabled:opacity-40"
                    >
                      {busyId === row.id ? 'جارٍ الإلغاء...' : 'نعم، ألغِ الاشتراك'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="touch-press min-h-11 rounded-xl bg-[#111114] border border-[#232329] text-xs font-bold text-[#96938a] cursor-pointer"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(row.id)}
                  className="touch-press min-h-11 w-full rounded-xl bg-[#111114] border border-[#232329] text-xs font-bold text-[#96938a] hover:border-[#c8a96e]/40 cursor-pointer"
                >
                  إلغاء الاشتراك
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
};
