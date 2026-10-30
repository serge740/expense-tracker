import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as XLSX from 'xlsx';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

/**
 * Self-backup export for the IT Support portal — exports this app's own
 * database (accounts, wallets, transactions, debts, scheduling, family
 * portal, notifications) for backup/restore. See data-import.service.ts for
 * the matching restore logic and the entity policy (what's OVERWRITE-able
 * vs. create-only).
 *
 * Deliberately excluded from every export, always:
 *  - RefreshToken, Device, Passkey, PasskeyChallenge, WebPushSubscription —
 *    live session/credential state bound to a specific device/browser;
 *    restoring them to a different point in time is meaningless at best.
 *  - Client.emailOtp/emailOtpExpiry/phoneOtp/phoneOtpExpiry — short-lived
 *    one-time codes; no restore scenario ever wants a stale OTP back.
 */
@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── JSON ───────────────────────────────────────────

  async buildJsonExport(options: any, actor: { id: string; name: string }) {
    const groups: string[] = options.groups ?? [];
    const activeOnly = options.recordFilter === 'active';
    const inactiveOnly = options.recordFilter === 'inactive';
    const clientWhere = activeOnly ? { isActive: true } : inactiveOnly ? { isActive: false } : {};
    const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options.dateTo ? new Date(options.dateTo) : null;
    const dateWhere = (dateFrom || dateTo)
      ? { createdAt: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }
      : {};

    const data: Record<string, any[]> = {
      clients: [], userSubCategories: [], notificationPreferences: [],
      wallets: [], transactions: [], budgets: [], savedViews: [], trashedTransactions: [],
      debts: [], debtInstallments: [], debtPayments: [],
      reminders: [], reminderFires: [], scheduledTransactions: [], scheduledOccurrences: [],
      families: [], familyMembers: [], familyInvites: [], familyActivities: [], activityEvents: [],
      familyComments: [], familyGoals: [], familyGoalContributions: [], familyAllowances: [], familyApprovals: [],
      notifications: [],
    };
    const includes = ['clients', 'userSubCategories', 'notificationPreferences'];

    const sanitizeClient = (c: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { emailOtp, emailOtpExpiry, phoneOtp, phoneOtpExpiry, ...safe } = c;
      return safe;
    };

    // Core — the account itself and its basic settings. Always exported.
    const clients = await this.prisma.client.findMany({ where: clientWhere, orderBy: { createdAt: 'asc' } });
    data.clients = clients.map(sanitizeClient);
    const exportedClientIds = clients.map((c) => c.id);
    data.userSubCategories = exportedClientIds.length
      ? await this.prisma.userSubCategory.findMany({ where: { clientId: { in: exportedClientIds } } })
      : [];
    data.notificationPreferences = exportedClientIds.length
      ? await this.prisma.notificationPreference.findMany({ where: { clientId: { in: exportedClientIds } } })
      : [];

    if (groups.includes('finances')) {
      includes.push('wallets', 'transactions', 'budgets', 'savedViews', 'trashedTransactions');
      data.wallets = await this.prisma.wallet.findMany({ orderBy: { createdAt: 'asc' } });
      data.transactions = await this.prisma.transaction.findMany({ where: dateWhere, orderBy: { createdAt: 'asc' } });
      data.budgets = await this.prisma.budget.findMany({ orderBy: { createdAt: 'asc' } });
      data.savedViews = await this.prisma.savedView.findMany({ orderBy: { createdAt: 'asc' } });
      data.trashedTransactions = await this.prisma.trashedTransaction.findMany({ orderBy: { deletedAt: 'asc' } });
    }

    if (groups.includes('debts')) {
      includes.push('debts', 'debtInstallments', 'debtPayments');
      data.debts = await this.prisma.debt.findMany({ orderBy: { createdAt: 'asc' } });
      const debtIds = data.debts.map((d) => d.id);
      if (debtIds.length) {
        data.debtInstallments = await this.prisma.debtInstallment.findMany({ where: { debtId: { in: debtIds } } });
        data.debtPayments = await this.prisma.debtPayment.findMany({ where: { debtId: { in: debtIds } } });
      }
    }

    if (groups.includes('scheduling')) {
      includes.push('reminders', 'reminderFires', 'scheduledTransactions', 'scheduledOccurrences');
      data.reminders = await this.prisma.reminder.findMany({ orderBy: { createdAt: 'asc' } });
      const reminderIds = data.reminders.map((r) => r.id);
      data.reminderFires = reminderIds.length
        ? await this.prisma.reminderFire.findMany({ where: { reminderId: { in: reminderIds } } })
        : [];
      data.scheduledTransactions = await this.prisma.scheduledTransaction.findMany({ orderBy: { createdAt: 'asc' } });
      const scheduleIds = data.scheduledTransactions.map((s) => s.id);
      data.scheduledOccurrences = scheduleIds.length
        ? await this.prisma.scheduledOccurrence.findMany({ where: { scheduleId: { in: scheduleIds } } })
        : [];
    }

    if (groups.includes('family')) {
      includes.push('families', 'familyMembers', 'familyInvites', 'familyActivities', 'activityEvents', 'familyComments', 'familyGoals', 'familyGoalContributions', 'familyAllowances', 'familyApprovals');
      data.families = await this.prisma.family.findMany({ orderBy: { createdAt: 'asc' } });
      const familyIds = data.families.map((f) => f.id);
      if (familyIds.length) {
        data.familyMembers = await this.prisma.familyMember.findMany({ where: { familyId: { in: familyIds } } });
        data.familyInvites = await this.prisma.familyInvite.findMany({ where: { familyId: { in: familyIds } } });
        data.familyActivities = await this.prisma.familyActivity.findMany({ where: { familyId: { in: familyIds } } });
        data.familyComments = await this.prisma.familyComment.findMany({ where: { familyId: { in: familyIds } } });
        data.familyGoals = await this.prisma.familyGoal.findMany({ where: { familyId: { in: familyIds } } });
        const goalIds = data.familyGoals.map((g) => g.id);
        data.familyGoalContributions = goalIds.length
          ? await this.prisma.familyGoalContribution.findMany({ where: { goalId: { in: goalIds } } })
          : [];
        data.familyAllowances = await this.prisma.familyAllowance.findMany({ where: { familyId: { in: familyIds } } });
        data.familyApprovals = await this.prisma.familyApproval.findMany({ where: { familyId: { in: familyIds } } });
      }
      data.activityEvents = await this.prisma.activityEvent.findMany({ where: dateWhere, orderBy: { createdAt: 'asc' } });
    }

    if (groups.includes('notifications')) {
      includes.push('notifications');
      data.notifications = await this.prisma.notification.findMany({ where: dateWhere, orderBy: { createdAt: 'asc' } });
    }

    const counts: Record<string, number> = {};
    for (const [key, arr] of Object.entries(data)) {
      if (arr.length) counts[key] = arr.length;
    }

    return {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: { id: actor.id, name: actor.name },
      projectName: 'expense_tracker',
      meta: {
        includes,
        dateFilter: { from: options.dateFrom ?? null, to: options.dateTo ?? null },
        recordFilter: options.recordFilter ?? 'all',
        counts,
      },
      data,
    };
  }

  // ─── EXCEL ──────────────────────────────────────────

  async buildExcelExport(options: any): Promise<Buffer> {
    const groups: string[] = options.groups ?? [];
    const wb = XLSX.utils.book_new();

    const clients = await this.prisma.client.findMany({ orderBy: { createdAt: 'asc' } });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients.map((c) => ({
      Name: `${c.firstName} ${c.lastName ?? ''}`.trim(), Email: c.email, Phone: c.phone,
      Verified: c.isVerified ? 'Yes' : 'No', Status: c.isActive ? 'Active' : 'Inactive',
      'Joined': c.createdAt.toISOString().split('T')[0],
    }))), 'Clients');

    if (groups.includes('finances')) {
      const wallets = await this.prisma.wallet.findMany({ include: { client: { select: { email: true } } } });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wallets.map((w) => ({
        Owner: w.client.email, Name: w.name, Bank: w.bank, Type: w.walletType, Currency: w.currency,
        Balance: Number(w.balance), Archived: w.archived ? 'Yes' : 'No',
      }))), 'Wallets');

      const transactions = await this.prisma.transaction.findMany({
        include: { client: { select: { email: true } } },
        orderBy: { date: 'desc' },
        take: 50000,
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map((t) => ({
        Owner: t.client.email, Date: t.date.toISOString().split('T')[0], Type: t.type, Category: t.category,
        Title: t.title, Amount: Number(t.amount),
      }))), 'Transactions');
    }

    if (groups.includes('debts')) {
      const debts = await this.prisma.debt.findMany({ include: { client: { select: { email: true } } } });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(debts.map((d) => ({
        Owner: d.client.email, Kind: d.kind, Person: d.person, Amount: Number(d.amount),
        Paid: Number(d.paid), Currency: d.currency, Status: d.status,
      }))), 'Debts');
    }

    if (groups.includes('family')) {
      const families = await this.prisma.family.findMany();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(families.map((f) => ({
        Name: f.name, Currency: f.currency, Status: f.status, Created: f.createdAt.toISOString().split('T')[0],
      }))), 'Families');
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ─── PDF ────────────────────────────────────────────

  async buildPdfExport(options: any): Promise<Buffer> {
    const groups: string[] = options.groups ?? [];
    const [clientCount, activeClientCount, walletCount, familyCount] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.count({ where: { isActive: true } }),
      groups.includes('finances') ? this.prisma.wallet.count() : Promise.resolve(0),
      groups.includes('family') ? this.prisma.family.count() : Promise.resolve(0),
    ]);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.fillColor('#00627F').fontSize(26).font('Helvetica-Bold').text('AbyExpense', { align: 'center' });
      doc.fontSize(14).font('Helvetica').fillColor('#000').text('Self-Backup Export Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`Generated: ${dateStr}`, { align: 'center' });
      doc.fillColor('#000').moveDown(2);

      doc.fontSize(14).font('Helvetica-Bold').text('Summary');
      doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.margins.left + pageWidth, doc.y + 4).stroke('#ccc');
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica');
      const kpis: [string, string][] = [
        ['Total Accounts', String(clientCount)],
        ['Active Accounts', String(activeClientCount)],
      ];
      if (groups.includes('finances')) kpis.push(['Wallets', String(walletCount)]);
      if (groups.includes('family')) kpis.push(['Families', String(familyCount)]);
      for (const [label, value] of kpis) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
      }

      doc.end();
    });
  }
}
