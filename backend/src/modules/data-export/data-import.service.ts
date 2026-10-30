import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ImportResult {
  entity: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

interface ExistingKeys {
  clientIds: Set<string>; inactiveClientIds: Set<string>;
  notificationPreferenceIds: Set<string>;
  userSubCategoryIds: Set<string>;
  familyIds: Set<string>;
  walletIds: Set<string>;
  transactionIds: Set<string>;
  budgetIds: Set<string>;
  savedViewIds: Set<string>;
  trashedTransactionIds: Set<string>;
  debtIds: Set<string>;
  debtInstallmentIds: Set<string>;
  debtPaymentIds: Set<string>;
  reminderIds: Set<string>;
  reminderFireIds: Set<string>;
  scheduledTransactionIds: Set<string>;
  scheduledOccurrenceIds: Set<string>;
  familyMemberIds: Set<string>;
  familyInviteIds: Set<string>;
  familyActivityIds: Set<string>;
  activityEventIds: Set<string>;
  familyCommentIds: Set<string>;
  familyGoalIds: Set<string>;
  familyGoalContributionIds: Set<string>;
  familyAllowanceIds: Set<string>;
  familyApprovalIds: Set<string>;
  notificationIds: Set<string>;
}

const BATCH = 500;

async function batchCreate(
  createMany: (data: any[]) => Promise<{ count: number }>,
  data: any[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < data.length; i += BATCH) {
    const result = await createMany(data.slice(i, i + BATCH));
    total += result.count;
  }
  return total;
}

/**
 * Restore logic for the IT Support portal's self-backup format (see
 * DataExportService). Every entity dedupes by its own id — this is a
 * same-system backup/restore tool (ids are always stable across export and
 * re-import), so there's no need to hunt for a separate natural business key
 * the way a cross-system import would.
 *
 * Policy:
 *  - Client, Family, NotificationPreference, UserSubCategory are
 *    OVERWRITE-able. Only Client supports RESTORE_DELETED (via `isActive`) —
 *    the schema's other status fields (Family.status, Wallet.archived,
 *    ScheduledTransaction.status, FamilyMember.status, ...) all mean
 *    different things, so a single generic "undelete" doesn't honestly apply
 *    to them and isn't implemented.
 *  - Every other entity (Wallet, Transaction, Budget, SavedView,
 *    TrashedTransaction, Debt*, Reminder*, Scheduled*, Family* portal
 *    records, Notification) is always create-only: a conflicting id is
 *    skipped no matter which strategy was chosen. This is real financial and
 *    personal data — restoring it should only ever ADD rows that don't
 *    exist yet, never silently overwrite a wallet balance or a transaction.
 *  - Most cross-entity references in this schema are plain string columns,
 *    not enforced foreign keys (e.g. Transaction.debtId, Debt.walletId,
 *    DebtInstallment.movedFromId) — only the handful of real `@relation`
 *    fields need validity checking before insert; the rest are passed
 *    through as-is.
 */
@Injectable()
export class DataImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Preview ─────────────────────────────────────────

  async preview(payload: any, strategy: string = 'SKIP', groups?: string[]) {
    this.validate(payload);
    const d = payload.data;
    const e = await this.loadExisting();
    const warnings = this.buildWarnings(payload, strategy);

    const wouldCreate: Record<string, number> = {};
    const wouldUpdate: Record<string, number> = {};
    const wouldSkip: Record<string, number> = {};
    const isOW = strategy === 'OVERWRITE';
    const hasGroup = (g: string) => !groups || groups.includes(g);

    const checkOverwritable = (key: string, items: any[], allIds: Set<string>) => {
      const arr = items ?? [];
      const nc = arr.filter((i) => !allIds.has(i.id)).length;
      const ex = arr.length - nc;
      wouldCreate[key] = nc; wouldUpdate[key] = isOW ? ex : 0; wouldSkip[key] = isOW ? 0 : ex;
    };

    const checkCreateOnly = (key: string, items: any[], existingIds: Set<string>, isValid: (i: any) => boolean = () => true) => {
      const arr = items ?? [];
      const valid = arr.filter(isValid);
      const failed = arr.length - valid.length;
      const nc = valid.filter((i) => !existingIds.has(i.id)).length;
      wouldCreate[key] = nc; wouldUpdate[key] = 0; wouldSkip[key] = valid.length - nc;
      return failed;
    };

    // Client supports RESTORE_DELETED via isActive — the only entity that does.
    {
      const arr = d.clients ?? [];
      const nc = arr.filter((c: any) => !e.clientIds.has(c.id)).length;
      const dc = arr.filter((c: any) => e.inactiveClientIds.has(c.id)).length;
      const ac = arr.filter((c: any) => e.clientIds.has(c.id) && !e.inactiveClientIds.has(c.id)).length;
      if (strategy === 'RESTORE_DELETED') { wouldCreate['clients'] = nc; wouldUpdate['clients'] = dc; wouldSkip['clients'] = ac; }
      else { wouldCreate['clients'] = nc; wouldUpdate['clients'] = isOW ? dc + ac : 0; wouldSkip['clients'] = isOW ? 0 : dc + ac; }
    }
    checkOverwritable('notificationPreferences', d.notificationPreferences, e.notificationPreferenceIds);
    checkOverwritable('userSubCategories', d.userSubCategories, e.userSubCategoryIds);

    if (hasGroup('finances')) {
      checkCreateOnly('wallets', d.wallets, e.walletIds, (w: any) => e.clientIds.has(w.clientId));
      checkCreateOnly('transactions', d.transactions, e.transactionIds, (t: any) => e.clientIds.has(t.clientId));
      checkCreateOnly('budgets', d.budgets, e.budgetIds, (b: any) => e.clientIds.has(b.clientId));
      checkCreateOnly('savedViews', d.savedViews, e.savedViewIds, (s: any) => e.clientIds.has(s.clientId));
      checkCreateOnly('trashedTransactions', d.trashedTransactions, e.trashedTransactionIds, (t: any) => e.clientIds.has(t.clientId));
    }

    if (hasGroup('debts')) {
      checkCreateOnly('debts', d.debts, e.debtIds, (x: any) => e.clientIds.has(x.clientId));
      checkCreateOnly('debtInstallments', d.debtInstallments, e.debtInstallmentIds, (x: any) => e.debtIds.has(x.debtId));
      checkCreateOnly('debtPayments', d.debtPayments, e.debtPaymentIds, (x: any) => e.debtIds.has(x.debtId));
    }

    if (hasGroup('scheduling')) {
      checkCreateOnly('reminders', d.reminders, e.reminderIds, (x: any) => e.clientIds.has(x.clientId));
      checkCreateOnly('reminderFires', d.reminderFires, e.reminderFireIds, (x: any) => e.reminderIds.has(x.reminderId));
      checkCreateOnly('scheduledTransactions', d.scheduledTransactions, e.scheduledTransactionIds, (x: any) => e.clientIds.has(x.clientId));
      checkCreateOnly('scheduledOccurrences', d.scheduledOccurrences, e.scheduledOccurrenceIds, (x: any) => e.scheduledTransactionIds.has(x.scheduleId));
    }

    if (hasGroup('family')) {
      checkCreateOnly('families', d.families, e.familyIds);
      checkCreateOnly('familyMembers', d.familyMembers, e.familyMemberIds, (x: any) => e.familyIds.has(x.familyId) && e.clientIds.has(x.clientId));
      checkCreateOnly('familyInvites', d.familyInvites, e.familyInviteIds, (x: any) => e.familyIds.has(x.familyId));
      checkCreateOnly('familyActivities', d.familyActivities, e.familyActivityIds, (x: any) => e.familyIds.has(x.familyId));
      checkCreateOnly('familyComments', d.familyComments, e.familyCommentIds, (x: any) => e.familyIds.has(x.familyId) && e.transactionIds.has(x.transactionId));
      checkCreateOnly('familyGoals', d.familyGoals, e.familyGoalIds, (x: any) => e.familyIds.has(x.familyId));
      checkCreateOnly('familyGoalContributions', d.familyGoalContributions, e.familyGoalContributionIds, (x: any) => e.familyGoalIds.has(x.goalId));
      checkCreateOnly('familyAllowances', d.familyAllowances, e.familyAllowanceIds, (x: any) => e.familyIds.has(x.familyId));
      checkCreateOnly('familyApprovals', d.familyApprovals, e.familyApprovalIds, (x: any) => e.familyIds.has(x.familyId));
      checkCreateOnly('activityEvents', d.activityEvents, e.activityEventIds, (x: any) => e.clientIds.has(x.clientId));
    }

    if (hasGroup('notifications')) checkCreateOnly('notifications', d.notifications, e.notificationIds, (x: any) => e.clientIds.has(x.clientId));

    const detectedGroups: string[] = [];
    if ((d.wallets?.length ?? 0) > 0 || (d.transactions?.length ?? 0) > 0 || (d.budgets?.length ?? 0) > 0 || (d.savedViews?.length ?? 0) > 0 || (d.trashedTransactions?.length ?? 0) > 0) detectedGroups.push('finances');
    if ((d.debts?.length ?? 0) > 0) detectedGroups.push('debts');
    if ((d.reminders?.length ?? 0) > 0 || (d.scheduledTransactions?.length ?? 0) > 0) detectedGroups.push('scheduling');
    if ((d.families?.length ?? 0) > 0) detectedGroups.push('family');
    if ((d.notifications?.length ?? 0) > 0) detectedGroups.push('notifications');

    return {
      exportedAt: payload.exportedAt ?? null,
      exportedBy: payload.exportedBy ?? null,
      projectName: payload.projectName ?? null,
      includes: payload.meta?.includes ?? [],
      counts: payload.meta?.counts ?? {},
      strategy, warnings, wouldCreate, wouldUpdate, wouldSkip, detectedGroups,
    };
  }

  // ─── Commit ──────────────────────────────────────────

  async commit(
    payload: any,
    options: { conflictStrategy: string; groups?: string[] },
    actor?: { id: string; name: string; fileName?: string },
  ): Promise<ImportResult[]> {
    this.validate(payload);
    const d = payload.data;
    const strategy = options.conflictStrategy ?? 'SKIP';
    const groups = options.groups;
    const hasGroup = (g: string) => !groups || groups.includes(g);

    const e = await this.loadExisting();
    const results: ImportResult[] = [];

    if (strategy === 'ABORT_ON_CONFLICT') {
      const conflicts = await this.detectConflicts(d, e);
      if (conflicts.length) throw new BadRequestException({ message: 'Import aborted: conflicts detected', conflicts });
    }

    // Frozen snapshot of existing ids as they were BEFORE this import — used
    // below to compute createdIds. `e` is mutated live by each importer, so
    // checking "did this exist before?" against it afterward would always
    // say yes for a row this very commit just created.
    const pre: Record<string, Set<string>> = {};
    for (const [key, set] of Object.entries(e)) pre[key] = new Set(set as Set<string>);

    await this.prisma.$transaction(async (tx) => {
      results.push(await this.importClients(d.clients ?? [], e, strategy, tx));
      if (d.families?.length) results.push(await this.importFamilies(d.families, e, strategy, tx));

      if (d.userSubCategories?.length) results.push(await this.importUserSubCategories(d.userSubCategories, e, strategy, tx));
      if (d.notificationPreferences?.length) results.push(await this.importNotificationPreferences(d.notificationPreferences, e, strategy, tx));

      if (hasGroup('finances') && d.wallets?.length) results.push(await this.importWallets(d.wallets, e, tx));

      if (hasGroup('family')) {
        if (d.familyMembers?.length) results.push(await this.importFamilyMembers(d.familyMembers, e, tx));
        if (d.familyInvites?.length) results.push(await this.importFamilyInvites(d.familyInvites, e, tx));
        if (d.familyActivities?.length) results.push(await this.importFamilyActivities(d.familyActivities, e, tx));
      }

      if (hasGroup('debts') && d.debts?.length) results.push(await this.importDebts(d.debts, e, tx));
      if (hasGroup('debts')) {
        if (d.debtInstallments?.length) results.push(await this.importDebtInstallments(d.debtInstallments, e, tx));
        if (d.debtPayments?.length) results.push(await this.importDebtPayments(d.debtPayments, e, tx));
      }

      if (hasGroup('scheduling') && d.scheduledTransactions?.length) results.push(await this.importScheduledTransactions(d.scheduledTransactions, e, tx));
      if (hasGroup('scheduling') && d.scheduledOccurrences?.length) results.push(await this.importScheduledOccurrences(d.scheduledOccurrences, e, tx));
      if (hasGroup('scheduling')) {
        if (d.reminders?.length) results.push(await this.importReminders(d.reminders, e, tx));
        if (d.reminderFires?.length) results.push(await this.importReminderFires(d.reminderFires, e, tx));
      }

      if (hasGroup('finances')) {
        if (d.transactions?.length) results.push(await this.importTransactions(d.transactions, e, tx));
        if (d.budgets?.length) results.push(await this.importBudgets(d.budgets, e, tx));
        if (d.savedViews?.length) results.push(await this.importSavedViews(d.savedViews, e, tx));
        if (d.trashedTransactions?.length) results.push(await this.importTrashedTransactions(d.trashedTransactions, e, tx));
      }

      if (hasGroup('family')) {
        if (d.familyComments?.length) results.push(await this.importFamilyComments(d.familyComments, e, tx));
        if (d.familyGoals?.length) results.push(await this.importFamilyGoals(d.familyGoals, e, tx));
        if (d.familyGoalContributions?.length) results.push(await this.importFamilyGoalContributions(d.familyGoalContributions, e, tx));
        if (d.familyAllowances?.length) results.push(await this.importFamilyAllowances(d.familyAllowances, e, tx));
        if (d.familyApprovals?.length) results.push(await this.importFamilyApprovals(d.familyApprovals, e, tx));
        if (d.activityEvents?.length) results.push(await this.importActivityEvents(d.activityEvents, e, tx));
      }

      if (hasGroup('notifications') && d.notifications?.length) results.push(await this.importNotifications(d.notifications, e, tx));
    }, { timeout: 120000, maxWait: 30000 });

    const createdIds: Record<string, string[]> = {};
    const col = (key: string, arr: any[], existedBefore: Set<string>) => {
      const ids = (arr ?? []).filter((x: any) => x?.id && !existedBefore.has(x.id)).map((x: any) => x.id);
      if (ids.length) createdIds[key] = ids;
    };

    col('clients', d.clients, pre.clientIds);
    col('families', d.families, pre.familyIds);
    col('userSubCategories', d.userSubCategories, pre.userSubCategoryIds);
    col('notificationPreferences', d.notificationPreferences, pre.notificationPreferenceIds);
    if (hasGroup('finances')) col('wallets', d.wallets, pre.walletIds);
    if (hasGroup('family')) {
      col('familyMembers', d.familyMembers, pre.familyMemberIds);
      col('familyInvites', d.familyInvites, pre.familyInviteIds);
      col('familyActivities', d.familyActivities, pre.familyActivityIds);
    }
    if (hasGroup('debts')) {
      col('debts', d.debts, pre.debtIds);
      col('debtInstallments', d.debtInstallments, pre.debtInstallmentIds);
      col('debtPayments', d.debtPayments, pre.debtPaymentIds);
    }
    if (hasGroup('scheduling')) {
      col('scheduledTransactions', d.scheduledTransactions, pre.scheduledTransactionIds);
      col('scheduledOccurrences', d.scheduledOccurrences, pre.scheduledOccurrenceIds);
      col('reminders', d.reminders, pre.reminderIds);
      col('reminderFires', d.reminderFires, pre.reminderFireIds);
    }
    if (hasGroup('finances')) {
      col('transactions', d.transactions, pre.transactionIds);
      col('budgets', d.budgets, pre.budgetIds);
      col('savedViews', d.savedViews, pre.savedViewIds);
      col('trashedTransactions', d.trashedTransactions, pre.trashedTransactionIds);
    }
    if (hasGroup('family')) {
      col('familyComments', d.familyComments, pre.familyCommentIds);
      col('familyGoals', d.familyGoals, pre.familyGoalIds);
      col('familyGoalContributions', d.familyGoalContributions, pre.familyGoalContributionIds);
      col('familyAllowances', d.familyAllowances, pre.familyAllowanceIds);
      col('familyApprovals', d.familyApprovals, pre.familyApprovalIds);
      col('activityEvents', d.activityEvents, pre.activityEventIds);
    }
    if (hasGroup('notifications')) col('notifications', d.notifications, pre.notificationIds);

    if (actor) {
      const summary = results.reduce(
        (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, skipped: acc.skipped + r.skipped, failed: acc.failed + r.failed }),
        { created: 0, updated: 0, skipped: 0, failed: 0 },
      );
      await this.prisma.importSnapshot.create({
        data: {
          performedById: actor.id,
          performedByName: actor.name,
          fileName: actor.fileName ?? 'backup.json',
          strategy,
          groups: groups ? (groups as any) : undefined,
          summary,
          createdIds,
          status: 'active',
        },
      });
    }

    return results;
  }

  // ─── Rollback ────────────────────────────────────────

  async listSnapshots(): Promise<any[]> {
    return this.prisma.importSnapshot.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async rollback(snapshotId: string, actor: { id: string; name: string }): Promise<void> {
    const snapshot = await this.prisma.importSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) throw new BadRequestException('Import snapshot not found');
    if (snapshot.status === 'rolled_back') throw new BadRequestException('This import has already been rolled back');

    const ids = snapshot.createdIds as Record<string, string[]>;
    const delById = async (model: any, idList?: string[]) => {
      if (idList?.length) await model.deleteMany({ where: { id: { in: idList } } });
    };

    await this.prisma.$transaction(async (tx) => {
      // Reverse dependency order — children before parents.
      await delById(tx.notification, ids.notifications);
      await delById(tx.activityEvent, ids.activityEvents);
      await delById(tx.familyApproval, ids.familyApprovals);
      await delById(tx.familyAllowance, ids.familyAllowances);
      await delById(tx.familyGoalContribution, ids.familyGoalContributions);
      await delById(tx.familyGoal, ids.familyGoals);
      await delById(tx.familyComment, ids.familyComments);
      await delById(tx.trashedTransaction, ids.trashedTransactions);
      await delById(tx.savedView, ids.savedViews);
      await delById(tx.budget, ids.budgets);
      await delById(tx.transaction, ids.transactions);
      await delById(tx.reminderFire, ids.reminderFires);
      await delById(tx.reminder, ids.reminders);
      await delById(tx.scheduledOccurrence, ids.scheduledOccurrences);
      await delById(tx.scheduledTransaction, ids.scheduledTransactions);
      await delById(tx.debtPayment, ids.debtPayments);
      await delById(tx.debtInstallment, ids.debtInstallments);
      await delById(tx.debt, ids.debts);
      await delById(tx.familyActivity, ids.familyActivities);
      await delById(tx.familyInvite, ids.familyInvites);
      await delById(tx.familyMember, ids.familyMembers);
      await delById(tx.wallet, ids.wallets);
      await delById(tx.notificationPreference, ids.notificationPreferences);
      await delById(tx.userSubCategory, ids.userSubCategories);
      await delById(tx.family, ids.families);
      await delById(tx.client, ids.clients);
    }, { timeout: 60000 });

    await this.prisma.importSnapshot.update({
      where: { id: snapshotId },
      data: { status: 'rolled_back', rolledBackAt: new Date(), rolledBackById: actor.id, rolledBackByName: actor.name },
    });
  }

  // ─── Entity Importers — accounts (OVERWRITE-able) ────

  private async importClients(items: any[], e: ExistingKeys, strategy: string, tx: any): Promise<ImportResult> {
    const newItems = items.filter((c) => !e.clientIds.has(c.id));
    const deletedItems = items.filter((c) => e.inactiveClientIds.has(c.id));
    const activeItems = items.filter((c) => e.clientIds.has(c.id) && !e.inactiveClientIds.has(c.id));
    let updated = 0;

    const mapCreate = (c: any) => ({
      id: c.id, firstName: c.firstName, lastName: c.lastName ?? null, email: c.email, phone: c.phone,
      googleId: c.googleId ?? null, appleId: c.appleId ?? null, facebookId: c.facebookId ?? null,
      passwordHash: c.passwordHash ?? null, isVerified: c.isVerified ?? false, profileImage: c.profileImage ?? null,
      isActive: c.isActive ?? true, isBiometric: c.isBiometric ?? false,
      emailVerifiedAt: c.emailVerifiedAt ? new Date(c.emailVerifiedAt) : null,
      phoneVerifiedAt: c.phoneVerifiedAt ? new Date(c.phoneVerifiedAt) : null,
      createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt),
    });

    const created = await batchCreate((data) => tx.client.createMany({ data: data.map(mapCreate), skipDuplicates: true }), newItems);
    newItems.forEach((c) => e.clientIds.add(c.id));

    if (strategy === 'RESTORE_DELETED' && deletedItems.length) {
      await tx.client.updateMany({ where: { id: { in: deletedItems.map((c) => c.id) } }, data: { isActive: true } });
      updated = deletedItems.length;
    } else if (strategy === 'OVERWRITE') {
      for (const c of [...deletedItems, ...activeItems]) {
        const { id, createdAt, ...rest } = mapCreate(c);
        await tx.client.update({ where: { id: c.id }, data: rest });
        updated++;
      }
    }

    const skipped =
      strategy === 'OVERWRITE' ? 0 :
      strategy === 'RESTORE_DELETED' ? activeItems.length :
      deletedItems.length + activeItems.length;
    return { entity: 'Clients', total: items.length, created, updated, skipped, failed: 0, warnings: ['Passwords restored as-is (already hashed)'] };
  }

  private async importFamilies(items: any[], e: ExistingKeys, strategy: string, tx: any): Promise<ImportResult> {
    const newItems = items.filter((f) => !e.familyIds.has(f.id));
    const existingItems = items.filter((f) => e.familyIds.has(f.id));
    let updated = 0;

    const mapCreate = (f: any) => ({
      id: f.id, name: f.name, currency: f.currency ?? 'RWF', timezone: f.timezone ?? 'UTC',
      status: f.status ?? 'ACTIVE', archivedAt: f.archivedAt ? new Date(f.archivedAt) : null,
      approvalThreshold: f.approvalThreshold ?? null, createdBy: f.createdBy,
      createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt),
    });

    const created = await batchCreate((data) => tx.family.createMany({ data: data.map(mapCreate), skipDuplicates: true }), newItems);
    newItems.forEach((f) => e.familyIds.add(f.id));

    if (strategy === 'OVERWRITE') {
      for (const f of existingItems) {
        const { id, createdAt, createdBy, ...rest } = mapCreate(f);
        await tx.family.update({ where: { id: f.id }, data: rest });
        updated++;
      }
    }

    const skipped = strategy === 'OVERWRITE' ? 0 : existingItems.length;
    return { entity: 'Families', total: items.length, created, updated, skipped, failed: 0, warnings: [] };
  }

  private async importUserSubCategories(items: any[], e: ExistingKeys, strategy: string, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId));
    const failed = items.length - valid.length;
    const newItems = valid.filter((x) => !e.userSubCategoryIds.has(x.id));
    const existingItems = valid.filter((x) => e.userSubCategoryIds.has(x.id));
    let updated = 0;

    const mapCreate = (x: any) => ({
      id: x.id, clientId: x.clientId, kind: x.kind, category: x.category, name: x.name,
      usageCount: x.usageCount ?? 1, lastUsedAt: new Date(x.lastUsedAt), createdAt: new Date(x.createdAt),
    });

    const created = await batchCreate((data) => tx.userSubCategory.createMany({ data: data.map(mapCreate), skipDuplicates: true }), newItems);
    newItems.forEach((x) => e.userSubCategoryIds.add(x.id));

    if (strategy === 'OVERWRITE') {
      for (const x of existingItems) {
        await tx.userSubCategory.update({ where: { id: x.id }, data: { usageCount: x.usageCount ?? 1, lastUsedAt: new Date(x.lastUsedAt) } });
        updated++;
      }
    }

    const skipped = strategy === 'OVERWRITE' ? 0 : existingItems.length;
    const warnings = failed ? [`${failed} sub-categories skipped — referenced client not found`] : [];
    return { entity: 'User Sub-Categories', total: items.length, created, updated, skipped, failed, warnings };
  }

  private async importNotificationPreferences(items: any[], e: ExistingKeys, strategy: string, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId));
    const failed = items.length - valid.length;
    const newItems = valid.filter((x) => !e.notificationPreferenceIds.has(x.id));
    const existingItems = valid.filter((x) => e.notificationPreferenceIds.has(x.id));
    let updated = 0;

    const mapFields = (x: any) => ({
      pushEnabled: x.pushEnabled ?? true, emailEnabled: x.emailEnabled ?? true, inAppEnabled: x.inAppEnabled ?? true,
      timezone: x.timezone ?? 'UTC', quietEnabled: x.quietEnabled ?? false, quietStart: x.quietStart ?? '22:00',
      quietEnd: x.quietEnd ?? '07:00', remindersPush: x.remindersPush ?? true, remindersEmail: x.remindersEmail ?? true,
      dailyPushCap: x.dailyPushCap ?? 8, language: x.language ?? 'en', notifyFamily: x.notifyFamily ?? true,
    });

    const created = await batchCreate(
      (data) => tx.notificationPreference.createMany({ data: data.map((x: any) => ({ id: x.id, clientId: x.clientId, ...mapFields(x) })), skipDuplicates: true }),
      newItems,
    );
    newItems.forEach((x) => e.notificationPreferenceIds.add(x.id));

    if (strategy === 'OVERWRITE') {
      for (const x of existingItems) {
        await tx.notificationPreference.update({ where: { id: x.id }, data: mapFields(x) });
        updated++;
      }
    }

    const skipped = strategy === 'OVERWRITE' ? 0 : existingItems.length;
    const warnings = failed ? [`${failed} notification preferences skipped — referenced client not found`] : [];
    return { entity: 'Notification Preferences', total: items.length, created, updated, skipped, failed, warnings };
  }

  // ─── Entity Importers — finances (always create-only) ───

  private async importWallets(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((w) => e.clientIds.has(w.clientId) && !e.walletIds.has(w.id));
    const failed = items.filter((w) => !e.clientIds.has(w.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.wallet.createMany({
        data: data.map((w: any) => ({
          id: w.id, clientId: w.clientId,
          familyId: w.familyId && e.familyIds.has(w.familyId) ? w.familyId : null,
          name: w.name, bank: w.bank, last4: w.last4 ?? null, accountHolder: w.accountHolder ?? null,
          accountNumber: w.accountNumber ?? null, color: w.color ?? '#0F2F3A', currency: w.currency ?? 'RWF',
          archived: w.archived ?? false, walletType: w.walletType ?? 'CHECKING', balance: w.balance,
          isDefault: w.isDefault ?? false, reconciledAt: w.reconciledAt ? new Date(w.reconciledAt) : null,
          reconciledBalance: w.reconciledBalance ?? null,
          createdAt: new Date(w.createdAt), updatedAt: new Date(w.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((w) => e.walletIds.add(w.id));
    const warnings = failed ? [`${failed} wallets skipped — referenced client not found`] : [];
    return { entity: 'Wallets', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importTransactions(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((t) => e.clientIds.has(t.clientId) && !e.transactionIds.has(t.id));
    const failed = items.filter((t) => !e.clientIds.has(t.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.transaction.createMany({
        data: data.map((t: any) => ({
          id: t.id, clientId: t.clientId,
          familyId: t.familyId && e.familyIds.has(t.familyId) ? t.familyId : null,
          walletId: t.walletId && e.walletIds.has(t.walletId) ? t.walletId : null,
          type: t.type, category: t.category, title: t.title, subCategory: t.subCategory ?? null,
          description: t.description ?? null, amount: t.amount, date: new Date(t.date),
          receiptUrl: t.receiptUrl ?? null, receiptReportUrl: t.receiptReportUrl ?? null,
          toWalletId: t.toWalletId ?? null, toAmount: t.toAmount ?? null, exchangeRate: t.exchangeRate ?? null,
          debtId: t.debtId ?? null, debtRole: t.debtRole ?? null, fundedByDebtId: t.fundedByDebtId ?? null,
          scheduledOccurrenceId: t.scheduledOccurrenceId && e.scheduledOccurrenceIds.has(t.scheduledOccurrenceId) ? t.scheduledOccurrenceId : null,
          transferGroupId: t.transferGroupId ?? null, note: t.note ?? null, tags: t.tags ?? null, dupeKept: t.dupeKept ?? false,
          createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((t) => e.transactionIds.add(t.id));
    const warnings = failed ? [`${failed} transactions skipped — referenced client not found`] : [];
    return { entity: 'Transactions', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importBudgets(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((b) => e.clientIds.has(b.clientId) && !e.budgetIds.has(b.id));
    const failed = items.filter((b) => !e.clientIds.has(b.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.budget.createMany({
        data: data.map((b: any) => ({
          id: b.id, clientId: b.clientId,
          familyId: b.familyId && e.familyIds.has(b.familyId) ? b.familyId : null,
          scopeKey: b.scopeKey, month: b.month, year: b.year, limit: b.limit,
          createdAt: new Date(b.createdAt), updatedAt: new Date(b.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((b) => e.budgetIds.add(b.id));
    const warnings = failed ? [`${failed} budgets skipped — referenced client not found`] : [];
    return { entity: 'Budgets', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importSavedViews(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((s) => e.clientIds.has(s.clientId) && !e.savedViewIds.has(s.id));
    const failed = items.filter((s) => !e.clientIds.has(s.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.savedView.createMany({
        data: data.map((s: any) => ({
          id: s.id, clientId: s.clientId,
          familyId: s.familyId && e.familyIds.has(s.familyId) ? s.familyId : null,
          scopeKey: s.scopeKey, name: s.name, filter: s.filter,
          createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((s) => e.savedViewIds.add(s.id));
    const warnings = failed ? [`${failed} saved views skipped — referenced client not found`] : [];
    return { entity: 'Saved Views', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importTrashedTransactions(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((t) => e.clientIds.has(t.clientId) && !e.trashedTransactionIds.has(t.id));
    const failed = items.filter((t) => !e.clientIds.has(t.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.trashedTransaction.createMany({
        data: data.map((t: any) => ({
          id: t.id, originalId: t.originalId, clientId: t.clientId,
          familyId: t.familyId && e.familyIds.has(t.familyId) ? t.familyId : null,
          scopeKey: t.scopeKey, deletedById: t.deletedById, snapshot: t.snapshot,
          title: t.title, type: t.type, amount: t.amount, currency: t.currency ?? null,
          deletedAt: new Date(t.deletedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((t) => e.trashedTransactionIds.add(t.id));
    const warnings = failed ? [`${failed} trashed transactions skipped — referenced client not found`] : [];
    return { entity: 'Trashed Transactions', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  // ─── Entity Importers — debts (always create-only) ──

  private async importDebts(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId) && !e.debtIds.has(x.id));
    const failed = items.filter((x) => !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.debt.createMany({
        data: data.map((x: any) => ({
          id: x.id, clientId: x.clientId,
          familyId: x.familyId && e.familyIds.has(x.familyId) ? x.familyId : null,
          kind: x.kind, person: x.person, phone: x.phone ?? null, amount: x.amount, paid: x.paid ?? 0,
          writtenOffAmount: x.writtenOffAmount ?? 0, spent: x.spent ?? 0, currency: x.currency,
          date: new Date(x.date), dueDate: x.dueDate ? new Date(x.dueDate) : null, note: x.note ?? null,
          walletId: x.walletId ?? null, principalTransactionId: x.principalTransactionId ?? null,
          status: x.status ?? 'OPEN', archivedAt: x.archivedAt ? new Date(x.archivedAt) : null,
          remindersOn: x.remindersOn ?? false, planAmount: x.planAmount ?? null, planRepeat: x.planRepeat ?? undefined,
          planStartAt: x.planStartAt ? new Date(x.planStartAt) : null, planTimezone: x.planTimezone ?? null,
          createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.debtIds.add(x.id));
    const warnings = failed ? [`${failed} debts skipped — referenced client not found`] : [];
    return { entity: 'Debts', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importDebtInstallments(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.debtIds.has(x.debtId) && !e.debtInstallmentIds.has(x.id));
    const failed = items.filter((x) => !e.debtIds.has(x.debtId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.debtInstallment.createMany({
        data: data.map((x: any) => ({
          id: x.id, debtId: x.debtId, dueAt: new Date(x.dueAt), plannedAmount: x.plannedAmount ?? null,
          status: x.status ?? 'PENDING', movedFromId: x.movedFromId ?? null, note: x.note ?? null,
          fromPlan: x.fromPlan ?? false, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.debtInstallmentIds.add(x.id));
    const warnings = failed ? [`${failed} debt installments skipped — referenced debt not found`] : [];
    return { entity: 'Debt Installments', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importDebtPayments(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.debtIds.has(x.debtId) && !e.debtPaymentIds.has(x.id));
    const failed = items.filter((x) => !e.debtIds.has(x.debtId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.debtPayment.createMany({
        data: data.map((x: any) => ({
          id: x.id, debtId: x.debtId, amount: x.amount, date: new Date(x.date),
          walletId: x.walletId ?? null, transactionId: x.transactionId ?? null, note: x.note ?? null,
          receiptUrl: x.receiptUrl ?? null, receiptReportUrl: x.receiptReportUrl ?? null,
          createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.debtPaymentIds.add(x.id));
    const warnings = failed ? [`${failed} debt payments skipped — referenced debt not found`] : [];
    return { entity: 'Debt Payments', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  // ─── Entity Importers — scheduling (always create-only) ──

  private async importScheduledTransactions(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId) && !e.scheduledTransactionIds.has(x.id));
    const failed = items.filter((x) => !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.scheduledTransaction.createMany({
        data: data.map((x: any) => ({
          id: x.id, clientId: x.clientId,
          familyId: x.familyId && e.familyIds.has(x.familyId) ? x.familyId : null,
          type: x.type, category: x.category, title: x.title, subCategory: x.subCategory ?? null,
          description: x.description ?? null, amount: x.amount,
          walletId: x.walletId && e.walletIds.has(x.walletId) ? x.walletId : null,
          startAt: new Date(x.startAt), timezone: x.timezone ?? 'UTC', repeat: x.repeat ?? undefined,
          mode: x.mode ?? 'REMIND_CONFIRM', status: x.status ?? 'ACTIVE',
          lastDueAt: x.lastDueAt ? new Date(x.lastDueAt) : null, nextDueAt: x.nextDueAt ? new Date(x.nextDueAt) : null,
          createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.scheduledTransactionIds.add(x.id));
    const warnings = failed ? [`${failed} scheduled transactions skipped — referenced client not found`] : [];
    return { entity: 'Scheduled Transactions', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importScheduledOccurrences(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.scheduledTransactionIds.has(x.scheduleId) && !e.scheduledOccurrenceIds.has(x.id));
    const failed = items.filter((x) => !e.scheduledTransactionIds.has(x.scheduleId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.scheduledOccurrence.createMany({
        data: data.map((x: any) => ({
          id: x.id, scheduleId: x.scheduleId, dueAt: new Date(x.dueAt), status: x.status ?? 'PENDING',
          transactionId: x.transactionId ?? null, failReason: x.failReason ?? null,
          handledAt: x.handledAt ? new Date(x.handledAt) : null, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.scheduledOccurrenceIds.add(x.id));
    const warnings = failed ? [`${failed} scheduled occurrences skipped — referenced schedule not found`] : [];
    return { entity: 'Scheduled Occurrences', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importReminders(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId) && !e.reminderIds.has(x.id));
    const failed = items.filter((x) => !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.reminder.createMany({
        data: data.map((x: any) => ({
          id: x.id, clientId: x.clientId, kind: x.kind ?? 'DEBT_PAYMENT',
          debtId: x.debtId && e.debtIds.has(x.debtId) ? x.debtId : null,
          installmentId: x.installmentId && e.debtInstallmentIds.has(x.installmentId) ? x.installmentId : null,
          occurrenceId: x.occurrenceId && e.scheduledOccurrenceIds.has(x.occurrenceId) ? x.occurrenceId : null,
          dueAt: new Date(x.dueAt), timezone: x.timezone ?? 'UTC', step: x.step ?? 0,
          nextFireAt: x.nextFireAt ? new Date(x.nextFireAt) : null, status: x.status ?? 'ACTIVE',
          snoozedUntil: x.snoozedUntil ? new Date(x.snoozedUntil) : null,
          claimedUntil: x.claimedUntil ? new Date(x.claimedUntil) : null,
          fireCount: x.fireCount ?? 0, lastFiredAt: x.lastFiredAt ? new Date(x.lastFiredAt) : null,
          notificationId: x.notificationId ?? null,
          createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.reminderIds.add(x.id));
    const warnings = failed ? [`${failed} reminders skipped — referenced client not found`] : [];
    return { entity: 'Reminders', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importReminderFires(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.reminderIds.has(x.reminderId) && !e.reminderFireIds.has(x.id));
    const failed = items.filter((x) => !e.reminderIds.has(x.reminderId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.reminderFire.createMany({
        data: data.map((x: any) => ({
          id: x.id, reminderId: x.reminderId, step: x.step, firedAt: new Date(x.firedAt), channels: x.channels,
          pushTickets: x.pushTickets ?? undefined, receiptsCheckedAt: x.receiptsCheckedAt ? new Date(x.receiptsCheckedAt) : null,
          action: x.action ?? 'NONE', actedAt: x.actedAt ? new Date(x.actedAt) : null,
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.reminderFireIds.add(x.id));
    const warnings = failed ? [`${failed} reminder fires skipped — referenced reminder not found`] : [];
    return { entity: 'Reminder Fires', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  // ─── Entity Importers — family portal (always create-only) ──

  private async importFamilyMembers(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && e.clientIds.has(x.clientId) && !e.familyMemberIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId) || !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyMember.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, clientId: x.clientId, role: x.role ?? 'MEMBER',
          status: x.status ?? 'ACTIVE', nickname: x.nickname ?? null, joinedAt: new Date(x.joinedAt),
          leftAt: x.leftAt ? new Date(x.leftAt) : null, activeKey: x.activeKey ?? null,
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyMemberIds.add(x.id));
    const warnings = failed ? [`${failed} family members skipped — referenced family or client not found`] : [];
    return { entity: 'Family Members', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyInvites(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && !e.familyInviteIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyInvite.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, invitedBy: x.invitedBy, role: x.role ?? 'MEMBER',
          tokenHash: x.tokenHash, code: x.code, phone: x.phone ?? null, email: x.email ?? null,
          status: x.status ?? 'PENDING', expiresAt: new Date(x.expiresAt),
          acceptedBy: x.acceptedBy ?? null, acceptedAt: x.acceptedAt ? new Date(x.acceptedAt) : null,
          createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyInviteIds.add(x.id));
    const warnings = failed ? [`${failed} family invites skipped — referenced family not found`] : [];
    return { entity: 'Family Invites', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyActivities(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && !e.familyActivityIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyActivity.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, actorId: x.actorId, action: x.action,
          targetId: x.targetId ?? null, meta: x.meta ?? undefined, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyActivityIds.add(x.id));
    const warnings = failed ? [`${failed} family activity rows skipped — referenced family not found`] : [];
    return { entity: 'Family Activity', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyComments(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && e.transactionIds.has(x.transactionId) && !e.familyCommentIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId) || !e.transactionIds.has(x.transactionId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyComment.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, transactionId: x.transactionId, authorId: x.authorId,
          body: x.body, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyCommentIds.add(x.id));
    const warnings = failed ? [`${failed} family comments skipped — referenced family or transaction not found (import "Finances" alongside "Family" if the transaction is missing)`] : [];
    return { entity: 'Family Comments', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyGoals(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && !e.familyGoalIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyGoal.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, name: x.name, target: x.target,
          targetDate: x.targetDate ? new Date(x.targetDate) : null, walletId: x.walletId ?? null,
          status: x.status ?? 'ACTIVE', createdById: x.createdById,
          createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyGoalIds.add(x.id));
    const warnings = failed ? [`${failed} family goals skipped — referenced family not found`] : [];
    return { entity: 'Family Goals', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyGoalContributions(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyGoalIds.has(x.goalId) && !e.familyGoalContributionIds.has(x.id));
    const failed = items.filter((x) => !e.familyGoalIds.has(x.goalId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyGoalContribution.createMany({
        data: data.map((x: any) => ({
          id: x.id, goalId: x.goalId, clientId: x.clientId, amount: x.amount, note: x.note ?? null,
          createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyGoalContributionIds.add(x.id));
    const warnings = failed ? [`${failed} family goal contributions skipped — referenced goal not found`] : [];
    return { entity: 'Family Goal Contributions', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyAllowances(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && !e.familyAllowanceIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyAllowance.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, clientId: x.clientId, monthlyLimit: x.monthlyLimit,
          createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyAllowanceIds.add(x.id));
    const warnings = failed ? [`${failed} family allowances skipped — referenced family not found`] : [];
    return { entity: 'Family Allowances', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importFamilyApprovals(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.familyIds.has(x.familyId) && !e.familyApprovalIds.has(x.id));
    const failed = items.filter((x) => !e.familyIds.has(x.familyId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.familyApproval.createMany({
        data: data.map((x: any) => ({
          id: x.id, familyId: x.familyId, requestedById: x.requestedById, snapshot: x.snapshot,
          title: x.title, amount: x.amount, status: x.status ?? 'PENDING',
          decidedById: x.decidedById ?? null, decidedAt: x.decidedAt ? new Date(x.decidedAt) : null,
          reason: x.reason ?? null, transactionId: x.transactionId ?? null, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.familyApprovalIds.add(x.id));
    const warnings = failed ? [`${failed} family approvals skipped — referenced family not found`] : [];
    return { entity: 'Family Approvals', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importActivityEvents(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId) && !e.activityEventIds.has(x.id));
    const failed = items.filter((x) => !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.activityEvent.createMany({
        data: data.map((x: any) => ({
          id: x.id, clientId: x.clientId,
          familyId: x.familyId && e.familyIds.has(x.familyId) ? x.familyId : null,
          scopeKey: x.scopeKey, actorId: x.actorId, kind: x.kind, entity: x.entity,
          entityId: x.entityId ?? null, title: x.title, amount: x.amount ?? null, currency: x.currency ?? null,
          changes: x.changes ?? undefined, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.activityEventIds.add(x.id));
    const warnings = failed ? [`${failed} activity events skipped — referenced client not found`] : [];
    return { entity: 'Activity Events', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  private async importNotifications(items: any[], e: ExistingKeys, tx: any): Promise<ImportResult> {
    const valid = items.filter((x) => e.clientIds.has(x.clientId) && !e.notificationIds.has(x.id));
    const failed = items.filter((x) => !e.clientIds.has(x.clientId)).length;
    const skipped = items.length - valid.length - failed;
    const created = await batchCreate(
      (data) => tx.notification.createMany({
        data: data.map((x: any) => ({
          id: x.id, clientId: x.clientId, title: x.title, body: x.body, type: x.type, channel: x.channel,
          read: x.read ?? false, data: x.data ?? undefined, createdAt: new Date(x.createdAt),
        })),
        skipDuplicates: true,
      }),
      valid,
    );
    valid.forEach((x) => e.notificationIds.add(x.id));
    const warnings = failed ? [`${failed} notifications skipped — referenced client not found`] : [];
    return { entity: 'Notifications', total: items.length, created, updated: 0, skipped, failed, warnings };
  }

  // ─── Helpers ─────────────────────────────────────────

  private validate(payload: any) {
    if (!payload || !payload.exportVersion || !payload.data) {
      throw new BadRequestException('Invalid backup file. Expected an AbyExpense self-backup export.');
    }
  }

  private buildWarnings(payload: any, strategy?: string): string[] {
    const d = payload.data;
    const warnings: string[] = [];
    if (d.clients?.length) warnings.push(`Account data included (${d.clients.length}) — passwords restored as-is (already hashed)`);
    if ((d.transactions?.length ?? 0) > 10000) warnings.push(`Large transaction history (${d.transactions.length.toLocaleString()} records) — import may take a while`);
    if ((d.activityEvents?.length ?? 0) > 10000) warnings.push(`Large activity feed (${d.activityEvents.length.toLocaleString()} records) — import may take a while`);
    if (strategy === 'OVERWRITE') warnings.push('OVERWRITE mode: existing Clients, Families, notification preferences and saved sub-categories will be replaced with backup values. Wallets, transactions, debts, reminders, schedules, family-portal records and notifications are never overwritten.');
    if (strategy === 'RESTORE_DELETED') warnings.push('RESTORE_DELETED mode: only deactivated client accounts will be reactivated. Nothing else in this schema has a matching "undelete" concept, so only Clients are affected.');
    return warnings;
  }

  private async detectConflicts(d: any, e: ExistingKeys): Promise<string[]> {
    const conflicts: string[] = [];
    if (d.clients?.some((c: any) => e.clientIds.has(c.id))) conflicts.push('Clients');
    if (d.families?.some((f: any) => e.familyIds.has(f.id))) conflicts.push('Families');
    return conflicts;
  }

  private async loadExisting(): Promise<ExistingKeys> {
    const [
      clients, notificationPreferences, userSubCategories,
      families, wallets, transactions, budgets, savedViews, trashedTransactions,
      debts, debtInstallments, debtPayments,
      reminders, reminderFires, scheduledTransactions, scheduledOccurrences,
      familyMembers, familyInvites, familyActivities, activityEvents, familyComments,
      familyGoals, familyGoalContributions, familyAllowances, familyApprovals,
      notifications,
    ] = await Promise.all([
      this.prisma.client.findMany({ select: { id: true, isActive: true } }),
      this.prisma.notificationPreference.findMany({ select: { id: true } }),
      this.prisma.userSubCategory.findMany({ select: { id: true } }),
      this.prisma.family.findMany({ select: { id: true } }),
      this.prisma.wallet.findMany({ select: { id: true } }),
      this.prisma.transaction.findMany({ select: { id: true } }),
      this.prisma.budget.findMany({ select: { id: true } }),
      this.prisma.savedView.findMany({ select: { id: true } }),
      this.prisma.trashedTransaction.findMany({ select: { id: true } }),
      this.prisma.debt.findMany({ select: { id: true } }),
      this.prisma.debtInstallment.findMany({ select: { id: true } }),
      this.prisma.debtPayment.findMany({ select: { id: true } }),
      this.prisma.reminder.findMany({ select: { id: true } }),
      this.prisma.reminderFire.findMany({ select: { id: true } }),
      this.prisma.scheduledTransaction.findMany({ select: { id: true } }),
      this.prisma.scheduledOccurrence.findMany({ select: { id: true } }),
      this.prisma.familyMember.findMany({ select: { id: true } }),
      this.prisma.familyInvite.findMany({ select: { id: true } }),
      this.prisma.familyActivity.findMany({ select: { id: true } }),
      this.prisma.activityEvent.findMany({ select: { id: true } }),
      this.prisma.familyComment.findMany({ select: { id: true } }),
      this.prisma.familyGoal.findMany({ select: { id: true } }),
      this.prisma.familyGoalContribution.findMany({ select: { id: true } }),
      this.prisma.familyAllowance.findMany({ select: { id: true } }),
      this.prisma.familyApproval.findMany({ select: { id: true } }),
      this.prisma.notification.findMany({ select: { id: true } }),
    ]);

    return {
      clientIds: new Set(clients.map((c) => c.id)),
      inactiveClientIds: new Set(clients.filter((c) => !c.isActive).map((c) => c.id)),
      notificationPreferenceIds: new Set(notificationPreferences.map((x) => x.id)),
      userSubCategoryIds: new Set(userSubCategories.map((x) => x.id)),
      familyIds: new Set(families.map((x) => x.id)),
      walletIds: new Set(wallets.map((x) => x.id)),
      transactionIds: new Set(transactions.map((x) => x.id)),
      budgetIds: new Set(budgets.map((x) => x.id)),
      savedViewIds: new Set(savedViews.map((x) => x.id)),
      trashedTransactionIds: new Set(trashedTransactions.map((x) => x.id)),
      debtIds: new Set(debts.map((x) => x.id)),
      debtInstallmentIds: new Set(debtInstallments.map((x) => x.id)),
      debtPaymentIds: new Set(debtPayments.map((x) => x.id)),
      reminderIds: new Set(reminders.map((x) => x.id)),
      reminderFireIds: new Set(reminderFires.map((x) => x.id)),
      scheduledTransactionIds: new Set(scheduledTransactions.map((x) => x.id)),
      scheduledOccurrenceIds: new Set(scheduledOccurrences.map((x) => x.id)),
      familyMemberIds: new Set(familyMembers.map((x) => x.id)),
      familyInviteIds: new Set(familyInvites.map((x) => x.id)),
      familyActivityIds: new Set(familyActivities.map((x) => x.id)),
      activityEventIds: new Set(activityEvents.map((x) => x.id)),
      familyCommentIds: new Set(familyComments.map((x) => x.id)),
      familyGoalIds: new Set(familyGoals.map((x) => x.id)),
      familyGoalContributionIds: new Set(familyGoalContributions.map((x) => x.id)),
      familyAllowanceIds: new Set(familyAllowances.map((x) => x.id)),
      familyApprovalIds: new Set(familyApprovals.map((x) => x.id)),
      notificationIds: new Set(notifications.map((x) => x.id)),
    };
  }
}
