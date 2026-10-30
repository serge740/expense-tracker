import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ITSupportAuthController } from './it-support-auth.controller';
import { ITSupportAuthService } from './it-support-auth.service';
import { ITAdminJwtAuthGuard } from '../../guards/itAdminGuard.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ITSupportAuthController],
  providers: [ITSupportAuthService, ITAdminJwtAuthGuard],
  exports: [ITAdminJwtAuthGuard, JwtModule, ITSupportAuthService],
})
export class ITSupportAuthModule {}
