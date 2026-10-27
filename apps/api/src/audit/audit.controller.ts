import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators';
import { AuditService } from './audit.service';

@Controller('audit')
@RequirePermission('audit:read')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('entity') entity?: string, @Query('limit') limit?: string) {
    return this.audit.list(entity || undefined, Number(limit) || 50);
  }

  @Get('verify')
  verify() {
    return this.audit.verify();
  }
}
