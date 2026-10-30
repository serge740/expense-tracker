import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [ClientAuthModule, FamilyModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
