-- Loan payment plan: an estimated payment kept up until a loan (money I borrowed) is paid off.
-- Debt.planAmount / planRepeat / planStartAt / planTimezone describe it; the pay dates it makes are DebtInstallment rows with fromPlan = true.

-- AlterTable
ALTER TABLE `Debt` ADD COLUMN `planAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `planRepeat` JSON NULL,
    ADD COLUMN `planStartAt` DATETIME(3) NULL,
    ADD COLUMN `planTimezone` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `DebtInstallment` ADD COLUMN `fromPlan` BOOLEAN NOT NULL DEFAULT false;
