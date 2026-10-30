-- The Activity timeline: one append-only line per change (new table, nothing existing is touched).
CREATE TABLE `ActivityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `entity` VARCHAR(20) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NULL,
    `changes` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityEvent_scopeKey_createdAt_idx`(`scopeKey`, `createdAt`),
    INDEX `ActivityEvent_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ActivityEvent` ADD CONSTRAINT `ActivityEvent_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
