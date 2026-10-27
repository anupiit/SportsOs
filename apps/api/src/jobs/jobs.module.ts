import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [InventoryModule],
  providers: [JobsService],
})
export class JobsModule {}
