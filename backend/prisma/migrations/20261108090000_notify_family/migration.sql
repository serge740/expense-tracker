-- Family notifications can be switched off per person (new column with a default, nothing existing is touched).
ALTER TABLE `NotificationPreference` ADD COLUMN `notifyFamily` BOOLEAN NOT NULL DEFAULT true;
