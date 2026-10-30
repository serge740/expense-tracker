ALTER TABLE `Transaction` ADD COLUMN `transferGroupId` VARCHAR(191) NULL;
CREATE INDEX `Transaction_transferGroupId_idx` ON `Transaction`(`transferGroupId`);
