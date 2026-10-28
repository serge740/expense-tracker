-- Run after `prisma migrate deploy` for 20261102090000_family_scope. Every query below must return no rows.
-- Also compare the row counts of Wallet, Transaction and Budget with the counts you noted BEFORE migrating: they must be identical.

-- 1. every budget has a scope key, and it matches who it belongs to
SELECT 'budget without a scope key' AS problem, `id` FROM `Budget` WHERE `scopeKey` IS NULL OR `scopeKey` = '';
SELECT 'budget scope key does not match its owner' AS problem, `id` FROM `Budget`
WHERE (`familyId` IS NULL AND `scopeKey` <> CONCAT('p:', `clientId`)) OR (`familyId` IS NOT NULL AND `scopeKey` <> CONCAT('f:', `familyId`));

-- 2. no two budgets share a scope key for the same month (the unique index guarantees it; this proves it held)
SELECT 'duplicate budget for a scope and month' AS problem, `scopeKey`, `month`, `year`, COUNT(*) AS n FROM `Budget`
GROUP BY `scopeKey`, `month`, `year` HAVING COUNT(*) > 1;

-- 3. a transaction and its wallet are in the same scope (both personal, or both in the same family)
SELECT 'transaction and wallet in different scopes' AS problem, t.`id` FROM `Transaction` t JOIN `Wallet` w ON w.`id` = t.`walletId`
WHERE NOT (t.`familyId` <=> w.`familyId`);
SELECT 'transfer between wallets of different scopes' AS problem, t.`id` FROM `Transaction` t JOIN `Wallet` w ON w.`id` = t.`toWalletId`
WHERE t.`type` = 'TRANSFER' AND NOT (t.`familyId` <=> w.`familyId`);

-- 4. a family row always points at a real, existing family
SELECT 'wallet in a missing family' AS problem, w.`id` FROM `Wallet` w LEFT JOIN `Family` f ON f.`id` = w.`familyId` WHERE w.`familyId` IS NOT NULL AND f.`id` IS NULL;
SELECT 'transaction in a missing family' AS problem, t.`id` FROM `Transaction` t LEFT JOIN `Family` f ON f.`id` = t.`familyId` WHERE t.`familyId` IS NOT NULL AND f.`id` IS NULL;

-- 5. debts, loans and schedules never produce family rows
SELECT 'loan or scheduled transaction in a family' AS problem, `id` FROM `Transaction`
WHERE `familyId` IS NOT NULL AND (`debtId` IS NOT NULL OR `fundedByDebtId` IS NOT NULL OR `scheduledOccurrenceId` IS NOT NULL OR `debtRole` IS NOT NULL);
