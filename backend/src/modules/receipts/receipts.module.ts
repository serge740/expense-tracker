import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ClientAuthModule } from '../client-auth/client-auth.module';

@Module({
  imports: [CloudinaryModule, ClientAuthModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
