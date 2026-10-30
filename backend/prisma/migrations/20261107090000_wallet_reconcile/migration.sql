-- Balance check: when the person last confirmed a wallet against the real account (new nullable columns, nothing existing is touched).
ALTER TABLE `Wallet` ADD COLUMN `reconciledAt` DATETIME(3) NULL, ADD COLUMN `reconciledBalance` DECIMAL(12, 2) NULL;
