-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `fundedByDebtId` VARCHAR(191) NULL;
ALTER TABLE `Debt` ADD COLUMN `spent` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Transaction_fundedByDebtId_idx` ON `Transaction`(`fundedByDebtId`);
