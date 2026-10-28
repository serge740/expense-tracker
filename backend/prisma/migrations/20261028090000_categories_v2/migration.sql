-- Categories v2: the ten categories people see (Food, Transport, Bills, Shopping, Personal, Entertainment, Giving, Business, Finance, Other).
-- 1. a private list of the subcategories each person typed or picked (kept apart for spending and income),
-- 2. every transaction and scheduled transaction in a retired category moves to its new one (the old enum values stay, unused),
-- 3. what people had already typed in the subCategory column becomes their own list.
-- Take a backup first; MySQL cannot undo a half-run migration. Check with prisma/verify/categories_v2_assertions.sql afterwards.

-- CreateTable
CREATE TABLE `UserSubCategory` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `kind` ENUM('INCOME', 'EXPENSE', 'TRANSFER', 'DEBT') NOT NULL,
    `category` ENUM('food', 'transport', 'shopping', 'health', 'entertainment', 'travel', 'groceries', 'salary', 'other', 'bills', 'rent', 'utilities', 'education', 'family', 'gifts', 'business', 'investment', 'subscriptions', 'personal_care', 'fuel', 'insurance', 'savings', 'freelance', 'refund', 'loan') NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 1,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserSubCategory_clientId_lastUsedAt_idx`(`clientId`, `lastUsedAt`),
    UNIQUE INDEX `UserSubCategory_clientId_kind_category_name_key`(`clientId`, `kind`, `category`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSubCategory` ADD CONSTRAINT `UserSubCategory_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Transaction: a retired category becomes the new one (a subcategory is filled in only where the old name says what it was)
UPDATE `Transaction` SET `subCategory` = 'Groceries' WHERE `category` = 'groceries' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `Transaction` SET `category` = 'food' WHERE `category` = 'groceries';
UPDATE `Transaction` SET `subCategory` = 'Fuel' WHERE `category` = 'fuel' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `Transaction` SET `category` = 'transport' WHERE `category` = 'fuel';
UPDATE `Transaction` SET `category` = 'transport' WHERE `category` = 'travel';
UPDATE `Transaction` SET `subCategory` = 'Rent' WHERE `category` = 'rent' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `Transaction` SET `category` = 'bills' WHERE `category` = 'rent';
UPDATE `Transaction` SET `category` = 'bills' WHERE `category` = 'utilities';
UPDATE `Transaction` SET `category` = 'bills' WHERE `category` = 'subscriptions';
UPDATE `Transaction` SET `category` = 'health' WHERE `category` = 'personal_care';
UPDATE `Transaction` SET `category` = 'health' WHERE `category` = 'education';
UPDATE `Transaction` SET `subCategory` = 'Family support' WHERE `category` = 'family' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `Transaction` SET `category` = 'gifts' WHERE `category` = 'family';

-- ScheduledTransaction: a retired category becomes the new one (a subcategory is filled in only where the old name says what it was)
UPDATE `ScheduledTransaction` SET `subCategory` = 'Groceries' WHERE `category` = 'groceries' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `ScheduledTransaction` SET `category` = 'food' WHERE `category` = 'groceries';
UPDATE `ScheduledTransaction` SET `subCategory` = 'Fuel' WHERE `category` = 'fuel' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `ScheduledTransaction` SET `category` = 'transport' WHERE `category` = 'fuel';
UPDATE `ScheduledTransaction` SET `category` = 'transport' WHERE `category` = 'travel';
UPDATE `ScheduledTransaction` SET `subCategory` = 'Rent' WHERE `category` = 'rent' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `ScheduledTransaction` SET `category` = 'bills' WHERE `category` = 'rent';
UPDATE `ScheduledTransaction` SET `category` = 'bills' WHERE `category` = 'utilities';
UPDATE `ScheduledTransaction` SET `category` = 'bills' WHERE `category` = 'subscriptions';
UPDATE `ScheduledTransaction` SET `category` = 'health' WHERE `category` = 'personal_care';
UPDATE `ScheduledTransaction` SET `category` = 'health' WHERE `category` = 'education';
UPDATE `ScheduledTransaction` SET `subCategory` = 'Family support' WHERE `category` = 'family' AND (`subCategory` IS NULL OR `subCategory` = '');
UPDATE `ScheduledTransaction` SET `category` = 'gifts' WHERE `category` = 'family';

-- What people already typed becomes their own list, with how often they used it (spending and income apart)
INSERT INTO `UserSubCategory` (`id`, `clientId`, `kind`, `category`, `name`, `usageCount`, `lastUsedAt`, `createdAt`)
SELECT UUID(), `clientId`, `type`, `category`, LEFT(TRIM(`subCategory`), 40), COUNT(*), MAX(`date`), CURRENT_TIMESTAMP(3)
FROM `Transaction`
WHERE `type` IN ('EXPENSE', 'INCOME') AND `subCategory` IS NOT NULL AND TRIM(`subCategory`) <> ''
GROUP BY `clientId`, `type`, `category`, LEFT(TRIM(`subCategory`), 40);
