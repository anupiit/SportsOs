import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AiService } from './ai.service';

class TurnDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content: string;
}

class AskDto {
  @IsString() @MinLength(2) @MaxLength(1000) question: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TurnDto) history?: TurnDto[];
}

class ReportDto {
  @IsIn(['week', 'month']) period: 'week' | 'month';
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @RequirePermission('ai.use')
  status() {
    return this.ai.status();
  }

  @Post('ask')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskDto) {
    return this.ai.ask(dto, user);
  }

  /** Server-sent events: sources → delta* → done (see docs/API.md). */
  @Post('ask/stream')
  @RequirePermission('ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async askStream(@CurrentUser() user: AuthUser, @Body() dto: AskDto, @Req() req: Request, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const abort = new AbortController();
    req.on('close', () => abort.abort());
    try {
      for await (const event of this.ai.askStream(dto, user, abort.signal)) {
        if (abort.signal.aborted) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`);
    }
    res.end();
  }

  @Post('report')
  @HttpCode(200)
  @RequirePermission('ai.report')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  report(@CurrentUser() user: AuthUser, @Body() dto: ReportDto) {
    return this.ai.report(dto.period, user.id);
  }

  @Get('usage')
  @RequirePermission('ai.manage')
  usage() {
    return this.ai.usage(30);
  }

  @Post('reindex')
  @HttpCode(200)
  @RequirePermission('ai.manage')
  async reindex() {
    return { indexed: await this.ai.reindex() };
  }
}
