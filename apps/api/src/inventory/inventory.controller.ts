import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermission } from '../common/decorators';
import {
  AdjustDto,
  CreateItemDto,
  CreateRequestDto,
  DecideRequestDto,
  FulfilRequestDto,
  IssueDto,
  RestockDto,
  ReturnDto,
  StockMovementDto,
  UpdateItemDto,
  WriteOffDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('items')
  @RequirePermission('inventory.view')
  list(@Query('q') q?: string, @Query('sport') sport?: string, @Query('lowStock') lowStock?: string) {
    return this.inventory.list(q, sport, lowStock === 'true');
  }

  @Get('items/by-qr/:code')
  @RequirePermission('inventory.view')
  byQr(@Param('code') code: string) {
    return this.inventory.byQr(code);
  }

  @Get('items/:id')
  @RequirePermission('inventory.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.get(user, id);
  }

  @Get('items/:id/qr')
  @RequirePermission('inventory.view')
  qr(@Param('id') id: string) {
    return this.inventory.qr(id);
  }

  @Get('items/:id/transactions')
  @RequirePermission('inventory.audit')
  itemTransactions(@Param('id') id: string) {
    return this.inventory.transactions(id);
  }

  @Get('transactions')
  @RequirePermission('inventory.audit')
  transactions(@Query('type') type?: string) {
    return this.inventory.transactions(undefined, type);
  }

  @Post('items')
  @RequirePermission('inventory.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.inventory.create(user, dto);
  }

  @Patch('items/:id')
  @RequirePermission('inventory.update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.inventory.update(user, id, dto);
  }

  @Post('items/:id/restock')
  @HttpCode(200)
  @RequirePermission('inventory.update')
  restock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RestockDto) {
    return this.inventory.restock(user, id, dto);
  }

  @Post('items/:id/damage')
  @HttpCode(200)
  @RequirePermission('inventory.update')
  damage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StockMovementDto) {
    return this.inventory.movement(user, id, 'DAMAGE_REPORT', dto.quantity, dto.note);
  }

  @Post('items/:id/repair')
  @HttpCode(200)
  @RequirePermission('inventory.update')
  repair(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StockMovementDto) {
    return this.inventory.movement(user, id, 'REPAIR', dto.quantity, dto.note);
  }

  @Post('items/:id/write-off')
  @HttpCode(200)
  @RequirePermission('inventory.update')
  writeOff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WriteOffDto) {
    return this.inventory.movement(user, id, dto.from === 'DAMAGED' ? 'WRITE_OFF_DAMAGED' : 'WRITE_OFF', dto.quantity, dto.note);
  }

  @Post('items/:id/adjust')
  @HttpCode(200)
  @RequirePermission('inventory.update')
  adjust(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdjustDto) {
    return this.inventory.adjust(user, id, dto.availableDelta, dto.note);
  }

  @Get('issues')
  issues(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('status') status?: string) {
    return this.inventory.listIssues(user, scope, status);
  }

  @Post('issues')
  @RequirePermission('inventory.issue')
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueDto) {
    return this.inventory.issue(user, dto);
  }

  @Post('issues/:id/return')
  @HttpCode(200)
  @RequirePermission('inventory.return')
  return(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnDto) {
    return this.inventory.return(user, id, dto);
  }

  @Get('alerts')
  @RequireAnyPermission('inventory.audit', 'inventory.issue')
  alerts() {
    return this.inventory.alerts();
  }

  // ------------------------------------------------------------ equipment requests

  @Get('requests')
  @RequireAnyPermission('inventory.request', 'inventory.approve_request')
  requests(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('status') status?: string) {
    return this.inventory.listRequests(user, scope, status);
  }

  @Post('requests')
  @RequirePermission('inventory.request')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.inventory.createRequest(user, dto);
  }

  @Post('requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('inventory.approve_request')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideRequestDto) {
    return this.inventory.decideRequest(user, id, true, dto.note);
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('inventory.approve_request')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideRequestDto) {
    return this.inventory.decideRequest(user, id, false, dto.note);
  }

  @Post('requests/:id/fulfil')
  @HttpCode(200)
  @RequirePermission('inventory.issue')
  fulfil(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FulfilRequestDto) {
    return this.inventory.fulfilRequest(user, id, dto.dueAt);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancelRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.cancelRequest(user, id);
  }
}
