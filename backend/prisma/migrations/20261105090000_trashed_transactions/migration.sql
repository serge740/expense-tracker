-- Deleted transactions kept for 30 days so they can be restored (new table, nothing existing is touched).
CREATE TABLE `TrashedTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `originalId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `deletedById` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrashedTransaction_scopeKey_deletedAt_idx`(`scopeKey`, `deletedAt`),
    INDEX `TrashedTransaction_originalId_idx`(`originalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TrashedTransaction` ADD CONSTRAINT `TrashedTransaction_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TrashedTransaction` ADD CONSTRAINT `TrashedTransaction_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
