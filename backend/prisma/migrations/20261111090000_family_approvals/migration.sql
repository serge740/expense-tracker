-- Approvals: an optional spending threshold on the family, and the requests waiting for a decision.
ALTER TABLE `Family` ADD COLUMN `approvalThreshold` DECIMAL(12, 2) NULL;

CREATE TABLE `FamilyApproval` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `reason` VARCHAR(200) NULL,
    `transactionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FamilyApproval_familyId_status_createdAt_idx`(`familyId`, `status`, `createdAt`),
    INDEX `FamilyApproval_requestedById_idx`(`requestedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FamilyApproval` ADD CONSTRAINT `FamilyApproval_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
