import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { FamilyService } from './family.service';
import { FamilyInvitesService } from './family-invites.service';
import { CreateFamilyDto, CreateInviteDto, DeleteFamilyDto, JoinFamilyDto, SetRoleDto, TransferOwnershipDto, UpdateFamilyDto } from './dto/family.dto';

/** Static paths (mine, join, invites/preview) come before the ":id" ones so they are never mistaken for an id. */
@Controller('family')
@UseGuards(ClientJwtAuthGuard)
export class FamilyController {
  constructor(private readonly family: FamilyService, private readonly invites: FamilyInvitesService) {}

  @Post()
  create(@Req() req: RequestWithClient, @Body() dto: CreateFamilyDto) { return this.family.create(req.client.id, dto); }

  @Get('mine')
  mine(@Req() req: RequestWithClient) { return this.family.mine(req.client.id); }

  // Wrong codes are the thing to guard: a few tries a minute, and the service locks a person out after ten misses a day.
  @Get('invites/preview')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  preview(@Req() req: RequestWithClient, @Query('token') token?: string, @Query('code') code?: string) {
    return this.invites.preview(req.client.id, { token, code });
  }

  @Post('join')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  join(@Req() req: RequestWithClient, @Body() dto: JoinFamilyDto) { return this.invites.accept(req.client.id, dto ?? {}); }

  @Patch(':id')
  update(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: UpdateFamilyDto) { return this.family.update(req.client.id, id, dto ?? {}); }

  @Delete(':id')
  archive(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: DeleteFamilyDto) { return this.family.archive(req.client.id, id, dto?.confirmName); }

  @Get(':id/members')
  members(@Req() req: RequestWithClient, @Param('id') id: string) { return this.family.members(req.client.id, id); }

  @Patch(':id/members/:clientId')
  setRole(@Req() req: RequestWithClient, @Param('id') id: string, @Param('clientId') clientId: string, @Body() dto: SetRoleDto) {
    return this.family.setRole(req.client.id, id, clientId, dto?.role);
  }

  @Delete(':id/members/:clientId')
  removeMember(@Req() req: RequestWithClient, @Param('id') id: string, @Param('clientId') clientId: string) {
    return this.family.removeMember(req.client.id, id, clientId);
  }

  @Post(':id/transfer-ownership')
  @HttpCode(200)
  transfer(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: TransferOwnershipDto) {
    return this.family.transferOwnership(req.client.id, id, dto?.toClientId);
  }

  @Post(':id/invites')
  createInvite(@Req() req: RequestWithClient, @Param('id') id: string, @Body() dto: CreateInviteDto) { return this.invites.create(req.client.id, id, dto ?? ({} as CreateInviteDto)); }

  @Get(':id/invites')
  listInvites(@Req() req: RequestWithClient, @Param('id') id: string) { return this.invites.list(req.client.id, id); }

  @Post(':id/invites/revoke-all')
  @HttpCode(200)
  revokeAll(@Req() req: RequestWithClient, @Param('id') id: string) { return this.invites.revokeAll(req.client.id, id); }

  @Delete(':id/invites/:inviteId')
  revokeInvite(@Req() req: RequestWithClient, @Param('id') id: string, @Param('inviteId') inviteId: string) { return this.invites.revoke(req.client.id, id, inviteId); }

  @Get(':id/activity')
  activity(@Req() req: RequestWithClient, @Param('id') id: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.family.activity(req.client.id, id, { limit: limit ? Number(limit) : undefined, before });
  }
}
