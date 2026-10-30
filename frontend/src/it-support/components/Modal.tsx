import { useEffect, type ComponentType, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  icon?: ComponentType<{ size?: number }>;
  iconTone?: string;
  title: ReactNode;
  description?: ReactNode;
  busy?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  size?: string;
  children?: ReactNode;
}

/** Dialog shell: backdrop, header (icon + title + description + ×), scrollable body, footer. */
export default function Modal({ icon, iconTone = 'bg-accent-soft text-accent', title, description, busy, onClose, footer, size = 'max-w-lg', children }: ModalProps) {
  const Icon = icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full ${size} flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl`}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          {Icon && (
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
              <Icon size={17} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-bold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-fg-3">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-4 hover:bg-panel-3 hover:text-fg disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
