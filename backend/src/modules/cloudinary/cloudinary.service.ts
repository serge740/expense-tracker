import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { cloudinary } from './cloudinary.config';

@Injectable()
export class CloudinaryService {
  uploadReceiptBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    const resourceType = mimeType.includes('png') ? 'image' : 'image';
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'expense-tracker/receipts', resource_type: resourceType },
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
