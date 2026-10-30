import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { FamilyController } from './family.controller';
import { FamilyExtrasController } from './family-extras.controller';
import { FamilyGoalsService } from './family-goals.service';
import { FamilyCommentsService } from './family-comments.service';
import { FamilyAllowancesService } from './family-allowances.service';
import { FamilyTransfersService } from './family-transfers.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { FamilyService } from './family.service';
import { FamilyInvitesService } from './family-invites.service';
import { FamilyAccessService } from './family-access.service';
import { ScopeService } from './scope/scope.service';
import { ScopeGuard } from './scope/scope.guard';

@Module({
  imports: [ClientAuthModule, NotificationsModule],
  controllers: [FamilyController, FamilyExtrasController],
  providers: [FamilyTransfersService, FamilyAllowancesService, FamilyGoalsService, FamilyCommentsService, FamilyService, FamilyInvitesService, FamilyAccessService, ScopeService, ScopeGuard],
  // Wallets, transactions, budgets and reports use the scope to know which family (if any) a request is standing in.
  exports: [FamilyAccessService, ScopeService, ScopeGuard],
})
export class FamilyModule {}
