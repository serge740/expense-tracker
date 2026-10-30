import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityService, type ActivityQuery } from './activity.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ReqScope, ScopeGuard } from '../family/scope/scope.guard';
import { Scope } from '../family/scope/scope';

@Controller('activity')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@ReqScope() scope: Scope, @Query() query: ActivityQuery) { return this.activity.list(scope, query); }
}
