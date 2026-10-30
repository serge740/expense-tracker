-- Family comments and goals (new tables, nothing existing is touched).
CREATE TABLE `FamilyComment` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FamilyComment_transactionId_createdAt_idx`(`transactionId`, `createdAt`),
    INDEX `FamilyComment_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FamilyGoal` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `target` DECIMAL(12, 2) NOT NULL,
    `targetDate` DATETIME(3) NULL,
    `walletId` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FamilyGoal_familyId_status_idx`(`familyId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FamilyGoalContribution` (
    `id` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `note` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FamilyGoalContribution_goalId_createdAt_idx`(`goalId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FamilyComment` ADD CONSTRAINT `FamilyComment_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FamilyComment` ADD CONSTRAINT `FamilyComment_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `Transaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FamilyGoal` ADD CONSTRAINT `FamilyGoal_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FamilyGoalContribution` ADD CONSTRAINT `FamilyGoalContribution_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `FamilyGoal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
