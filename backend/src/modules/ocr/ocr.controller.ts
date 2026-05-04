import {
  Controller, HttpException, Post, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

@Controller('ocr')
@UseGuards(ClientJwtAuthGuard)
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('scan-receipt')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async scanReceipt(
    @Req() _req: RequestWithClient,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) throw new HttpException('No image provided', 400);
      return await this.ocrService.scanReceipt(file.buffer, file.mimetype);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(e.message || 'OCR processing failed', 500);
    }
  }
}
