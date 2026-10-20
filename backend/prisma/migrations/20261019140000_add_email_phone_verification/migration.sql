-- AlterTable
ALTER TABLE `Client` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `phoneOtp` VARCHAR(191) NULL,
    ADD COLUMN `phoneOtpExpiry` DATETIME(3) NULL,
    ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL;

