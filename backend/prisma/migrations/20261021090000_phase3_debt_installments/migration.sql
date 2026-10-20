-- CreateTable
CREATE TABLE `DebtInstallment` (
    `id` VARCHAR(191) NOT NULL,
    `debtId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `plannedAmount` DECIMAL(12, 2) NULL,
    `status` ENUM('PENDING', 'MOVED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `movedFromId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DebtInstallment_debtId_status_dueAt_idx`(`debtId`, `status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DebtInstallment` ADD CONSTRAINT `DebtInstallment_debtId_fkey` FOREIGN KEY (`debtId`) REFERENCES `Debt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every open debt that already has a due date gets that date as its first pay date.
-- (No planned amount: it means "the rest", so old debts behave exactly as before.)
INSERT INTO `DebtInstallment` (`id`, `debtId`, `dueAt`, `plannedAmount`, `status`, `createdAt`)
SELECT UUID(), d.`id`, d.`dueDate`, NULL, 'PENDING', CURRENT_TIMESTAMP(3)
FROM `Debt` d
WHERE d.`dueDate` IS NOT NULL AND d.`status` = 'OPEN';
