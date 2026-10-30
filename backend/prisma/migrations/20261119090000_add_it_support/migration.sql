-- CreateTable
-- Powers the new /it-support portal: a separate staff login (ITAdmin), and an audit trail of
-- self-backup restores for rollback (ImportSnapshot).
CREATE TABLE `ITAdmin` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ITAdmin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `performedById` VARCHAR(191) NOT NULL,
    `performedByName` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL DEFAULT 'backup.json',
    `strategy` VARCHAR(191) NOT NULL DEFAULT 'SKIP',
    `groups` JSON NULL,
    `summary` JSON NOT NULL,
    `createdIds` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `rolledBackAt` DATETIME(3) NULL,
    `rolledBackById` VARCHAR(191) NULL,
    `rolledBackByName` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
