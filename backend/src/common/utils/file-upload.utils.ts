import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { NotFoundException } from '@nestjs/common';

export const createUnifiedUploadConfig = (): MulterOptions => ({
  storage: diskStorage({
    destination: (req, file, cb) => {
      let subFolder: string | undefined;

      if (file.fieldname === 'profileImage') {
        subFolder = 'profile_images';
      } else if (file.fieldname === 'receiptImage') {
        subFolder = 'receipts';
      } else if (file.fieldname === 'attachments') {
        subFolder = 'attachments';
      }

      if (!subFolder) {
        return cb(new Error(`Invalid upload field name: ${file.fieldname}`), '' as any);
      }

      const uploadDir = path.join(process.cwd(), 'uploads', subFolder);

      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      } catch (err) {
        cb(err as Error, '' as any);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(
        null,
        `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`,
      );
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|svg|pdf|doc|docx|xls|xlsx|txt|csv|zip/;
    const isValidExt = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const isValidMime = allowedTypes.test(file.mimetype);

    if (!isValidExt || !isValidMime) {
      return cb(new Error('File type not allowed'), false);
    }

    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 4,
  },
});

export const deleteFile = (filepath: string) => {
  if (!filepath) throw new NotFoundException('file not found');
  const fullPath = path.join(process.cwd(), filepath);
  fs.unlink(fullPath, (err) => {
    if (err) {
      console.error('Failed to delete file:', err);
    }
  });
};

export const ProfileImageFileFields = [{ name: 'profileImage', maxCount: 1 }];
export const ReceiptFileFields = [{ name: 'receiptImage', maxCount: 1 }];
export const AttachmentsFileFields = [{ name: 'attachments', maxCount: 10 }];

export const ProfileUploadConfig = createUnifiedUploadConfig();
export const ReceiptUploadConfig = createUnifiedUploadConfig();
export const AttachmentsUploadConfig = createUnifiedUploadConfig();
