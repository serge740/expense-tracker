-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `debtId` VARCHAR(191) NULL,
    MODIFY `type` ENUM('INCOME', 'EXPENSE', 'TRANSFER', 'DEBT') NOT NULL,
    MODIFY `category` ENUM('food', 'transport', 'shopping', 'health', 'entertainment', 'travel', 'groceries', 'salary', 'other', 'bills', 'rent', 'utilities', 'education', 'family', 'gifts', 'business', 'investment', 'subscriptions', 'personal_care', 'fuel', 'insurance', 'savings', 'freelance', 'refund') NOT NULL;

-- CreateTable
CREATE TABLE `Debt` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `kind` ENUM('BORROWED', 'LENT') NOT NULL,
    `person` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueDate` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,
    `walletId` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'SETTLED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Debt_clientId_status_idx`(`clientId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DebtPayment` (
    `id` VARCHAR(191) NOT NULL,
    `debtId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `walletId` VARCHAR(191) NULL,
    `transactionId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DebtPayment_debtId_idx`(`debtId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Transaction_debtId_idx` ON `Transaction`(`debtId`);

-- AddForeignKey
ALTER TABLE `Debt` ADD CONSTRAINT `Debt_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DebtPayment` ADD CONSTRAINT `DebtPayment_debtId_fkey` FOREIGN KEY (`debtId`) REFERENCES `Debt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

