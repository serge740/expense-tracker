import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [ClientAuthModule, CloudinaryModule],
  controllers: [OcrController],
  providers: [OcrService],
})
export class OcrModule {}
