// Ported from expo_app/components/date-picker-modal.tsx
import React from 'react';
import { DateTimeSheet } from '@/components/datetime-sheet';

export interface DatePickerModalProps {
  visible: boolean;
  title?: string;
  value?: Date | null;
  /** false = date only. Kept so existing screens keep working. */
  showTime?: boolean;
  /** Open on the full month calendar (good for past or far-away dates). */
  calendar?: boolean;
  minDate?: Date | null;
  maxDate?: Date | null;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

/** Compatibility wrapper: the original picker's props, powered by the new DateTimeSheet. */
export function DatePickerModal({ showTime = true, calendar, ...rest }: DatePickerModalProps) {
  return <DateTimeSheet {...rest} mode={showTime ? 'datetime' : 'date'} defaultView={calendar ? 'calendar' : 'strip'} />;
}
