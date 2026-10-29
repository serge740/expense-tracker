-- Optional proof of payment on a loan / debt payment (nullable, nothing is rewritten).
ALTER TABLE `DebtPayment` ADD COLUMN `receiptUrl` VARCHAR(191) NULL,
    ADD COLUMN `receiptReportUrl` VARCHAR(191) NULL;
