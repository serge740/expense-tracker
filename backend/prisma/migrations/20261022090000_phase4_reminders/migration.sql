-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('transaction', 'security', 'system', 'reminder') NOT NULL;

-- AlterTable
ALTER TABLE `NotificationPreference`
    ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    ADD COLUMN `quietEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `quietStart` VARCHAR(191) NOT NULL DEFAULT '22:00',
    ADD COLUMN `quietEnd` VARCHAR(191) NOT NULL DEFAULT '07:00',
    ADD COLUMN `remindersPush` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `remindersEmail` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `dailyPushCap` INTEGER NOT NULL DEFAULT 8;

-- AlterTable
-- Existing debts keep reminders OFF (nothing starts pushing by surprise); new debts turn it on in the app.
ALTER TABLE `Debt` ADD COLUMN `remindersOn` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `Reminder` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DEBT_PAYMENT') NOT NULL DEFAULT 'DEBT_PAYMENT',
    `debtId` VARCHAR(191) NULL,
    `installmentId` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `step` INTEGER NOT NULL DEFAULT 0,
    `nextFireAt` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'SNOOZED', 'DONE', 'DISMISSED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `snoozedUntil` DATETIME(3) NULL,
    `claimedUntil` DATETIME(3) NULL,
    `fireCount` INTEGER NOT NULL DEFAULT 0,
    `lastFiredAt` DATETIME(3) NULL,
    `notificationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Reminder_installmentId_key`(`installmentId`),
    INDEX `Reminder_status_nextFireAt_idx`(`status`, `nextFireAt`),
    INDEX `Reminder_clientId_status_idx`(`clientId`, `status`),
    INDEX `Reminder_debtId_idx`(`debtId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReminderFire` (
    `id` VARCHAR(191) NOT NULL,
    `reminderId` VARCHAR(191) NOT NULL,
    `step` INTEGER NOT NULL,
    `firedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `channels` JSON NOT NULL,
    `pushTickets` JSON NULL,
    `receiptsCheckedAt` DATETIME(3) NULL,
    `action` ENUM('NONE', 'OPENED', 'SNOOZED', 'DONE', 'DISMISSED') NOT NULL DEFAULT 'NONE',
    `actedAt` DATETIME(3) NULL,

    INDEX `ReminderFire_reminderId_idx`(`reminderId`),
    INDEX `ReminderFire_receiptsCheckedAt_firedAt_idx`(`receiptsCheckedAt`, `firedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_debtId_fkey` FOREIGN KEY (`debtId`) REFERENCES `Debt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_installmentId_fkey` FOREIGN KEY (`installmentId`) REFERENCES `DebtInstallment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReminderFire` ADD CONSTRAINT `ReminderFire_reminderId_fkey` FOREIGN KEY (`reminderId`) REFERENCES `Reminder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
