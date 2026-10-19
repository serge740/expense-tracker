-- AlterTable
ALTER TABLE `client` ADD COLUMN `facebookId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Client_facebookId_key` ON `Client`(`facebookId`);

