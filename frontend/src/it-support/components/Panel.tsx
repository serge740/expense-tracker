import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function Panel({ title, sub, action, children, className = '' }: PanelProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-panel ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-[14px] font-bold text-fg">{title}</h2>}
            {sub && <p className="mt-0.5 text-[12px] text-fg-3">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
