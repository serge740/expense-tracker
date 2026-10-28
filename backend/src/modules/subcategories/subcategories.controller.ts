import { Controller, Delete, Get, HttpException, Param, Req, UseGuards } from '@nestjs/common';
import { SubCategoriesService } from './subcategories.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

@Controller('subcategories')
@UseGuards(ClientJwtAuthGuard)
export class SubCategoriesController {
  constructor(private readonly subCategories: SubCategoriesService) {}

  @Get()
  async list(@Req() req: RequestWithClient) {
    try {
      return await this.subCategories.list(req.client.id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to load your subcategories', e.status || 400);
    }
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.subCategories.remove(req.client.id, id);
    } catch (e: any) {
      throw new HttpException(e.message || 'Failed to remove it', e.status || 400);
    }
  }
}
