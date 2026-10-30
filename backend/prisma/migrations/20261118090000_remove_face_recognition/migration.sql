-- AlterTable
-- Custom face-descriptor login was never used by the web or mobile client (confirmed: zero
-- enrolled accounts in the live database). Removing it end to end per owner request.
ALTER TABLE `client` DROP COLUMN `faceDescriptor`,
    DROP COLUMN `isFaceRecognition`;
