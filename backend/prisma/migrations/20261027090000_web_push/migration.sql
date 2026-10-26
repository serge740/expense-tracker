-- CreateTable
CREATE TABLE `WebPushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` VARCHAR(191) NOT NULL,
    `auth` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `userAgent` VARCHAR(400) NULL,
    `browser` VARCHAR(40) NULL,
    `os` VARCHAR(40) NULL,
    `deviceType` VARCHAR(10) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastFailureAt` DATETIME(3) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WebPushSubscription_clientId_idx`(`clientId`),
    UNIQUE INDEX `WebPushSubscription_endpoint_key`(`endpoint`(255)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WebPushSubscription` ADD CONSTRAINT `WebPushSubscription_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

