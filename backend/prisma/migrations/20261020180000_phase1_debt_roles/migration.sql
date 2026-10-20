-- AlterTable
ALTER TABLE `Debt` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `principalTransactionId` VARCHAR(191) NULL,
    ADD COLUMN `writtenOffAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    MODIFY `status` ENUM('OPEN', 'SETTLED', 'WRITTEN_OFF', 'FORGIVEN') NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `debtRole` ENUM('BORROW_IN', 'LEND_OUT', 'REPAY_OUT', 'REPAY_IN') NULL;

-- CreateIndex
CREATE INDEX `Transaction_clientId_debtRole_date_idx` ON `Transaction`(`clientId`, `debtRole`, `date`);

-- ─── Backfill (deterministic) ────────────────────────────────────────────────
-- Debt-linked transactions are never user-editable, so every row with a debtId is
-- either a payment (referenced by DebtPayment.transactionId) or the single principal.

-- 1) Payments: repaying a borrowed debt goes out, being repaid a lent one comes in.
UPDATE `Transaction` t
    JOIN `DebtPayment` p ON p.`transactionId` = t.`id`
    JOIN `Debt` d ON d.`id` = p.`debtId`
SET t.`debtRole` = IF(d.`kind` = 'BORROWED', 'REPAY_OUT', 'REPAY_IN');

-- 2) Principal: the debt-linked transaction that no payment points to.
UPDATE `Transaction` t
    JOIN `Debt` d ON d.`id` = t.`debtId`
    LEFT JOIN `DebtPayment` p ON p.`transactionId` = t.`id`
SET t.`debtRole` = IF(d.`kind` = 'BORROWED', 'BORROW_IN', 'LEND_OUT')
WHERE t.`debtId` IS NOT NULL AND p.`id` IS NULL;

-- 3) Remember which transaction is each debt's principal.
UPDATE `Debt` d
    JOIN `Transaction` t ON t.`debtId` = d.`id` AND t.`debtRole` IN ('BORROW_IN', 'LEND_OUT')
SET d.`principalTransactionId` = t.`id`;
