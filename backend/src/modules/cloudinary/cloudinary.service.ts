import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { cloudinary } from './cloudinary.config';

@Injectable()
export class CloudinaryService {
  uploadReceiptBuffer(
    buffer: Buffer,
    mimeType: string,
    options?: { folder?: string; resourceType?: 'image' | 'auto' | 'raw'; filename?: string },
  ): Promise<string> {
    const folder = options?.folder ?? 'expense-tracker/receipts';
    const resourceType = options?.resourceType ?? 'image';
    return new Promise((resolve, reject) => {
      const uploadOpts: Record<string, unknown> = { folder, resource_type: resourceType };
      if (options?.filename) uploadOpts.public_id = options.filename;
      const stream = cloudinary.uploader.upload_stream(
        uploadOpts,
        (error, result) => {
          if (error || !result) {
            reject(new InternalServerErrorException(error?.message ?? 'Cloudinary upload failed'));
          } else {
            resolve(result.secure_url);
          }
        },
      );
      stream.end(buffer);
    });
  }

  getPublicIdFromUrl(url: string): string {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.(\w+)$/);
    if (!match) throw new Error('Invalid Cloudinary URL');
    return match[1];
  }

  async deleteReceipt(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
