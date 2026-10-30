-- Saved filters for the History page (new table, nothing existing is touched).
CREATE TABLE `SavedView` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `filter` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SavedView_scopeKey_idx`(`scopeKey`),
    UNIQUE INDEX `SavedView_scopeKey_name_key`(`scopeKey`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
