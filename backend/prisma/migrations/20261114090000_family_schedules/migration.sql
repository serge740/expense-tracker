ALTER TABLE `ScheduledTransaction` ADD COLUMN `familyId` VARCHAR(191) NULL;
CREATE INDEX `ScheduledTransaction_familyId_status_idx` ON `ScheduledTransaction`(`familyId`, `status`);
ALTER TABLE `ScheduledTransaction` ADD CONSTRAINT `ScheduledTransaction_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
