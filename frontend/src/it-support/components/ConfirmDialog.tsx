import { useState, type ComponentType, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  icon?: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  title: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** In-app replacement for window.confirm, for a destructive action that needs a clear "are you sure". */
export default function ConfirmDialog({ icon, title, description, details, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const Icon = icon;
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose} role="presentation">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl bg-panel shadow-2xl">
        <div className="flex items-start gap-3 px-5 pt-5">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Icon size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-fg">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-fg-3">{description}</p>}
          </div>
        </div>
        {details && <div className="px-5 py-4">{details}</div>}
        <div className="mt-4 flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border-strong px-4 py-2 text-[13px] font-medium text-fg hover:border-accent disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : Icon && <Icon size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
