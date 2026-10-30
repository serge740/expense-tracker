import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { ScopeGuard } from '../family/scope/scope.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { ApprovalsService } from './approvals.service';

/** Approvals live under the family's own address; every call checks the caller is an active member of exactly that family. */
@Controller('family/:id/approvals')
@UseGuards(ClientJwtAuthGuard, ScopeGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('settings') settings(@Req() r: RequestWithClient, @Param('id') id: string) { return this.approvals.getSettings(r.client.id, id); }
  @Put('settings') setSettings(@Req() r: RequestWithClient, @Param('id') id: string, @Body() dto: { threshold?: unknown }) { return this.approvals.setSettings(r.client.id, id, dto ?? {}); }
  @Get() list(@Req() r: RequestWithClient, @Param('id') id: string, @Query('status') status?: string) { return this.approvals.list(r.client.id, id, status); }
  @Post(':approvalId/approve') approve(@Req() r: RequestWithClient, @Param('id') id: string, @Param('approvalId') aid: string) { return this.approvals.approve(r.client.id, id, aid); }
  @Post(':approvalId/reject') reject(@Req() r: RequestWithClient, @Param('id') id: string, @Param('approvalId') aid: string, @Body() dto: { reason?: unknown }) { return this.approvals.reject(r.client.id, id, aid, dto ?? {}); }
  @Delete(':approvalId') cancel(@Req() r: RequestWithClient, @Param('id') id: string, @Param('approvalId') aid: string) { return this.approvals.cancel(r.client.id, id, aid); }
}
