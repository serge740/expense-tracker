import { CategorySlug } from '../../../../generated/prisma';
import { RepeatRule } from '../recurrence';

export class CreateScheduledDto {
  type: 'INCOME' | 'EXPENSE';
  category: CategorySlug;
  title: string;
  amount: number;
  subCategory?: string;
  description?: string;
  walletId?: string;
  /** ISO date-time of the first date. Must be in the future. */
  startAt: string;
  /** IANA zone the rule is worked out in. Defaults to the person's notification time zone. */
  timezone?: string;
  /** null or missing = happens once. */
  repeat?: RepeatRule | null;
  /** REMIND_CONFIRM (default): a reminder, you tap Pay. AUTO_POST: created for you at the due time. */
  mode?: 'REMIND_CONFIRM' | 'AUTO_POST';
}

export class UpdateScheduledDto {
  category?: CategorySlug;
  title?: string;
  amount?: number;
  subCategory?: string | null;
  description?: string | null;
  walletId?: string | null;
  startAt?: string;
  timezone?: string;
  repeat?: RepeatRule | null;
  mode?: 'REMIND_CONFIRM' | 'AUTO_POST';
}

export class ConfirmOccurrenceDto {
  /** Only for this one date. */
  amount?: number;
  walletId?: string | null;
}
