import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';

@Module({
  imports: [PrismaModule, ClientAuthModule],
  controllers: [AppController],
})
export class AppModule {}
