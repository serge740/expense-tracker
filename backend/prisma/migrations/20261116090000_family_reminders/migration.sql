-- A family pay date or schedule date reminds every owner and admin: one reminder per person, not one per date.
-- The new unique indexes start with the same column the foreign keys need, so they are added before the old ones go.
CREATE UNIQUE INDEX `Reminder_installmentId_clientId_key` ON `Reminder`(`installmentId`, `clientId`);
CREATE UNIQUE INDEX `Reminder_occurrenceId_clientId_key` ON `Reminder`(`occurrenceId`, `clientId`);
DROP INDEX `Reminder_installmentId_key` ON `Reminder`;
DROP INDEX `Reminder_occurrenceId_key` ON `Reminder`;
