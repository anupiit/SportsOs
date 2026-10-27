import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { CreateItemDto, IssueDto, RestockDto, ReturnDto, UpdateItemDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('items')
  list(@Query('q') q?: string, @Query('sport') sport?: string, @Query('lowStock') lowStock?: string) {
    return this.inventory.list(q, sport, lowStock === 'true');
  }

  @Get('items/by-qr/:code')
  byQr(@Param('code') code: string) {
    return this.inventory.byQr(code);
  }

  @Get('items/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.get(user, id);
  }

  @Get('items/:id/qr')
  qr(@Param('id') id: string) {
    return this.inventory.qr(id);
  }

  @Post('items')
  @RequirePermission('inventory:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.inventory.create(user, dto);
  }

  @Patch('items/:id')
  @RequirePermission('inventory:manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.inventory.update(user, id, dto);
  }

  @Post('items/:id/restock')
  @HttpCode(200)
  @RequirePermission('inventory:manage')
  restock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RestockDto) {
    return this.inventory.restock(user, id, dto);
  }

  @Get('issues')
  issues(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('status') status?: string) {
    return this.inventory.listIssues(user, scope, status);
  }

  @Post('issues')
  @RequirePermission('inventory:issue')
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueDto) {
    return this.inventory.issue(user, dto);
  }

  @Post('issues/:id/return')
  @HttpCode(200)
  @RequirePermission('inventory:issue')
  return(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnDto) {
    return this.inventory.return(user, id, dto);
  }

  @Get('alerts')
  @RequirePermission('inventory:issue')
  alerts() {
    return this.inventory.alerts();
  }
}
