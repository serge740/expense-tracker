import type { ReactNode } from 'react';

const TONE_CLASSES = {
  ok: 'text-success bg-success-soft',
  warn: 'text-warning bg-warning-soft',
  danger: 'text-danger bg-danger-soft',
  info: 'text-info bg-info-soft',
  mute: 'text-fg-4 bg-mute-soft',
};

export default function Badge({ tone = 'mute', children }: { tone?: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${TONE_CLASSES[tone] || TONE_CLASSES.mute}`}>
      {children}
    </span>
  );
}
