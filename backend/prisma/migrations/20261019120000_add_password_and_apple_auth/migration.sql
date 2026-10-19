-- AlterTable
ALTER TABLE `client` ADD COLUMN `appleId` VARCHAR(191) NULL,
    ADD COLUMN `passwordHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Client_appleId_key` ON `Client`(`appleId`);

