import { Module } from '@nestjs/common';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyInvitesService } from './family-invites.service';
import { FamilyAccessService } from './family-access.service';
import { ScopeService } from './scope/scope.service';
import { ScopeGuard } from './scope/scope.guard';

@Module({
  imports: [ClientAuthModule],
  controllers: [FamilyController],
  providers: [FamilyService, FamilyInvitesService, FamilyAccessService, ScopeService, ScopeGuard],
  // Wallets, transactions, budgets and reports use the scope to know which family (if any) a request is standing in.
  exports: [FamilyAccessService, ScopeService, ScopeGuard],
})
export class FamilyModule {}
