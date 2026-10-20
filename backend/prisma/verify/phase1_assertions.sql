-- Run AFTER the 20261020180000_phase1_debt_roles migration on any database.
-- Every query below must return ZERO rows. A non-empty result means the backfill needs a look.

-- 1) Debt-linked transactions without a role
SELECT 'debt-linked transaction has no debtRole' AS problem, t.id
FROM `Transaction` t
WHERE t.debtId IS NOT NULL AND t.debtRole IS NULL;

-- 2) A role on a transaction that is not debt-linked
SELECT 'debtRole without debtId' AS problem, t.id
FROM `Transaction` t
WHERE t.debtId IS NULL AND t.debtRole IS NOT NULL;

-- 3) More than one principal per debt
SELECT 'more than one principal' AS problem, t.debtId, COUNT(*) AS n
FROM `Transaction` t
WHERE t.debtRole IN ('BORROW_IN', 'LEND_OUT')
GROUP BY t.debtId
HAVING COUNT(*) > 1;

-- 4) A debt that has a wallet but no principal transaction
SELECT 'debt with wallet but no principal' AS problem, d.id
FROM `Debt` d
WHERE d.walletId IS NOT NULL AND d.principalTransactionId IS NULL;

-- 5) Role does not match the debt kind
SELECT 'role/kind mismatch' AS problem, t.id
FROM `Transaction` t
JOIN `Debt` d ON d.id = t.debtId
WHERE (d.kind = 'BORROWED' AND t.debtRole NOT IN ('BORROW_IN', 'REPAY_OUT'))
   OR (d.kind = 'LENT'     AND t.debtRole NOT IN ('LEND_OUT', 'REPAY_IN'));

-- 6) Paid total does not match the sum of payments (informational drift check)
SELECT 'paid differs from sum of payments' AS problem, d.id, d.paid, COALESCE(SUM(p.amount), 0) AS summed
FROM `Debt` d
LEFT JOIN `DebtPayment` p ON p.debtId = d.id
GROUP BY d.id, d.paid
HAVING ABS(d.paid - COALESCE(SUM(p.amount), 0)) > 0.005;
