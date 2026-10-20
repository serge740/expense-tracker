import { Controller, HttpException, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReceiptsService } from './receipts.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Controller('receipts')
@UseGuards(ClientJwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('process')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async process(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new HttpException('No file provided', 400);
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new HttpException('Use an image (JPG/PNG/WebP), PDF, or Word (.docx) file', 400);
    }
    try {
      return await this.receiptsService.process(file.buffer, file.mimetype, file.originalname);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(e.message || 'Receipt processing failed', 500);
    }
  }
}
