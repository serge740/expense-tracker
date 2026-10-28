-- Family scope (F2). Every new column is nullable or backfilled first, so no existing row is ever invalid and no existing row changes meaning:
-- familyId NULL means "personal", exactly as before.

-- AlterTable: wallets and transactions can belong to a family
ALTER TABLE `Wallet` ADD COLUMN `familyId` VARCHAR(191) NULL;
ALTER TABLE `Transaction` ADD COLUMN `familyId` VARCHAR(191) NULL;

-- AlterTable: budgets get a scope key. Added empty, filled for every existing (personal) budget, and only then made required.
ALTER TABLE `Budget` ADD COLUMN `familyId` VARCHAR(191) NULL, ADD COLUMN `scopeKey` VARCHAR(191) NULL;
UPDATE `Budget` SET `scopeKey` = CONCAT('p:', `clientId`) WHERE `scopeKey` IS NULL;
ALTER TABLE `Budget` MODIFY `scopeKey` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Wallet_familyId_idx` ON `Wallet`(`familyId`);
CREATE INDEX `Transaction_familyId_date_idx` ON `Transaction`(`familyId`, `date`);
CREATE INDEX `Budget_familyId_idx` ON `Budget`(`familyId`);
CREATE UNIQUE INDEX `Budget_scopeKey_month_year_key` ON `Budget`(`scopeKey`, `month`, `year`);

-- DropIndex: one budget per person per month is now "one per scope key per month". Budget_clientId_idx keeps the clientId foreign key indexed.
DROP INDEX `Budget_clientId_month_year_key` ON `Budget`;

-- AddForeignKey: a family's money goes with the family when it is finally purged (archiving never deletes anything)
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Budget` ADD CONSTRAINT `Budget_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
