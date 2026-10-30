ALTER TABLE `Debt` ADD COLUMN `familyId` VARCHAR(191) NULL;
CREATE INDEX `Debt_familyId_status_idx` ON `Debt`(`familyId`, `status`);
ALTER TABLE `Debt` ADD CONSTRAINT `Debt_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
