import { PrismaService } from '../src/prisma/prisma.service';
import { PushPayload, PushSender, PushTicket } from '../src/modules/reminders/push.service';
import { RemindersService } from '../src/modules/reminders/reminders.service';

/** Records pushes instead of sending them. */
export class FakePush implements PushSender {
  sent: { clientId: string; payload: PushPayload }[] = [];
  receiptsFor: PushTicket[] = [];
  async sendToClient(clientId: string, payload: PushPayload): Promise<PushTicket[]> {
    this.sent.push({ clientId, payload });
    return [{ id: `ticket-${this.sent.length}`, token: 'ExponentPushToken[fake]' }];
  }
  async checkReceipts(tickets: PushTicket[]) {
    this.receiptsFor.push(...tickets);
    return { delivered: tickets.length, failed: 0, pruned: 0 };
  }
}

/** Records emails instead of sending them. */
export class FakeEmail {
  sent: { to: string; subject: string; template: string; data: Record<string, any> }[] = [];
  async sendEmail(to: string, subject: string, template: string, data: Record<string, any> = {}) {
    this.sent.push({ to, subject, template, data });
  }
}

export function makeReminders(prisma: PrismaService) {
  const push = new FakePush();
  const email = new FakeEmail();
  const reminders = new RemindersService(prisma, push, email as any);
  return { reminders, push, email };
}
