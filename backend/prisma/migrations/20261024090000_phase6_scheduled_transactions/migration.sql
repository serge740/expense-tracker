-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `scheduledOccurrenceId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ScheduledTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `type` ENUM('INCOME', 'EXPENSE', 'TRANSFER', 'DEBT') NOT NULL,
    `category` ENUM('food', 'transport', 'shopping', 'health', 'entertainment', 'travel', 'groceries', 'salary', 'other', 'bills', 'rent', 'utilities', 'education', 'family', 'gifts', 'business', 'investment', 'subscriptions', 'personal_care', 'fuel', 'insurance', 'savings', 'freelance', 'refund', 'loan') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subCategory` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `walletId` VARCHAR(191) NULL,
    `startAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `repeat` JSON NULL,
    `mode` ENUM('REMIND_CONFIRM', 'AUTO_POST') NOT NULL DEFAULT 'REMIND_CONFIRM',
    `status` ENUM('ACTIVE', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `lastDueAt` DATETIME(3) NULL,
    `nextDueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScheduledTransaction_clientId_status_idx`(`clientId`, `status`),
    INDEX `ScheduledTransaction_status_nextDueAt_idx`(`status`, `nextDueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledOccurrence` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'POSTED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `transactionId` VARCHAR(191) NULL,
    `failReason` VARCHAR(191) NULL,
    `handledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScheduledOccurrence_scheduleId_status_idx`(`scheduleId`, `status`),
    INDEX `ScheduledOccurrence_status_dueAt_idx`(`status`, `dueAt`),
    UNIQUE INDEX `ScheduledOccurrence_scheduleId_dueAt_key`(`scheduleId`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Reminder` MODIFY `kind` ENUM('DEBT_PAYMENT', 'SCHEDULED_TX') NOT NULL DEFAULT 'DEBT_PAYMENT',
    ADD COLUMN `occurrenceId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Transaction_scheduledOccurrenceId_key` ON `Transaction`(`scheduledOccurrenceId`);

-- CreateIndex
CREATE UNIQUE INDEX `Reminder_occurrenceId_key` ON `Reminder`(`occurrenceId`);

-- AddForeignKey
ALTER TABLE `ScheduledTransaction` ADD CONSTRAINT `ScheduledTransaction_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledTransaction` ADD CONSTRAINT `ScheduledTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledOccurrence` ADD CONSTRAINT `ScheduledOccurrence_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ScheduledTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_occurrenceId_fkey` FOREIGN KEY (`occurrenceId`) REFERENCES `ScheduledOccurrence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
