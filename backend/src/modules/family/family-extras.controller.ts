import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { FamilyGoalsService, type GoalInput } from './family-goals.service';
import { FamilyCommentsService } from './family-comments.service';
import { FamilyAllowancesService } from './family-allowances.service';
import { FamilyTransfersService, type ContributeInput, type ReimburseInput } from './family-transfers.service';

/** Goals and comments live under the family's own address. Every call checks the caller is an active member of exactly that family. */
@Controller('family/:id')
@UseGuards(ClientJwtAuthGuard)
export class FamilyExtrasController {
  constructor(private readonly goals: FamilyGoalsService, private readonly comments: FamilyCommentsService, private readonly allowances: FamilyAllowancesService, private readonly transfers: FamilyTransfersService) {}

  @Get('goals') listGoals(@Req() r: RequestWithClient, @Param('id') id: string) { return this.goals.list(r.client.id, id); }
  @Post('goals') createGoal(@Req() r: RequestWithClient, @Param('id') id: string, @Body() dto: GoalInput) { return this.goals.create(r.client.id, id, dto ?? {}); }
  @Get('goals/:goalId') getGoal(@Req() r: RequestWithClient, @Param('id') id: string, @Param('goalId') goalId: string) { return this.goals.get(r.client.id, id, goalId); }
  @Patch('goals/:goalId') updateGoal(@Req() r: RequestWithClient, @Param('id') id: string, @Param('goalId') goalId: string, @Body() dto: GoalInput) { return this.goals.update(r.client.id, id, goalId, dto ?? {}); }
  @Delete('goals/:goalId') removeGoal(@Req() r: RequestWithClient, @Param('id') id: string, @Param('goalId') goalId: string) { return this.goals.remove(r.client.id, id, goalId); }
  @Post('goals/:goalId/contributions') contribute(@Req() r: RequestWithClient, @Param('id') id: string, @Param('goalId') goalId: string, @Body() dto: { amount?: unknown; note?: unknown }) { return this.goals.contribute(r.client.id, id, goalId, dto ?? {}); }
  @Delete('goals/:goalId/contributions/:cid') removeContribution(@Req() r: RequestWithClient, @Param('id') id: string, @Param('goalId') goalId: string, @Param('cid') cid: string) { return this.goals.removeContribution(r.client.id, id, goalId, cid); }

  // "mine" first: it must not be read as a member id.
  @Get('allowances/mine') myAllowance(@Req() r: RequestWithClient, @Param('id') id: string) { return this.allowances.mine(r.client.id, id).then(a => a ?? { none: true }); }
  @Get('allowances') listAllowances(@Req() r: RequestWithClient, @Param('id') id: string) { return this.allowances.list(r.client.id, id); }
  @Put('allowances/:memberId') setAllowance(@Req() r: RequestWithClient, @Param('id') id: string, @Param('memberId') memberId: string, @Body() dto: { limit?: unknown }) { return this.allowances.set(r.client.id, id, memberId, dto ?? {}); }
  @Delete('allowances/:memberId') removeAllowance(@Req() r: RequestWithClient, @Param('id') id: string, @Param('memberId') memberId: string) { return this.allowances.remove(r.client.id, id, memberId); }

  @Get('transfers/options') transferOptions(@Req() r: RequestWithClient, @Param('id') id: string) { return this.transfers.options(r.client.id, id); }
  @Post('transfers/contribute') contributeMoney(@Req() r: RequestWithClient, @Param('id') id: string, @Body() dto: ContributeInput) { return this.transfers.contribute(r.client.id, id, dto ?? {}); }
  @Post('transfers/reimburse') reimburseMember(@Req() r: RequestWithClient, @Param('id') id: string, @Body() dto: ReimburseInput) { return this.transfers.reimburse(r.client.id, id, dto ?? {}); }

  @Get('transactions/:txId/comments') listComments(@Req() r: RequestWithClient, @Param('id') id: string, @Param('txId') txId: string) { return this.comments.list(r.client.id, id, txId); }
  @Post('transactions/:txId/comments') addComment(@Req() r: RequestWithClient, @Param('id') id: string, @Param('txId') txId: string, @Body() dto: { body?: unknown }) { return this.comments.add(r.client.id, id, txId, dto ?? {}); }
  @Delete('comments/:commentId') removeComment(@Req() r: RequestWithClient, @Param('id') id: string, @Param('commentId') commentId: string) { return this.comments.remove(r.client.id, id, commentId); }
}
