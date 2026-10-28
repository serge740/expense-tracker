import { Module } from '@nestjs/common';
import { SubCategoriesController } from './subcategories.controller';
import { SubCategoriesService } from './subcategories.service';
import { ClientAuthModule } from '../client-auth/client-auth.module';

@Module({
  imports: [ClientAuthModule],
  controllers: [SubCategoriesController],
  providers: [SubCategoriesService],
})
export class SubCategoriesModule {}
