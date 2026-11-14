import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AssistantService, type AssistantEvent } from './assistant.service';
import { DeliveryReportDto } from './dto/delivery-report.dto';
import { JobDraftDto } from './dto/job-draft.dto';
import { OutcomeDto } from './dto/outcome.dto';

/** Above the assistant's own per-minute check, so a flood never reaches the database. */
const ASSISTANT_RATE_LIMIT = { bucket: 'assistant', limit: 10, windowSeconds: 60 };

@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Whether the assistant can be used now, and what is left of today's limit. */
  @Get('quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.assistant.quota(user);
  }

  /**
   * A job draft, streamed as newline-delimited JSON: each part as soon as it
   * is written and checked, then the whole draft. A request refused by the
   * checks gets a plain JSON error instead, before anything is streamed.
   */
  @Roles('startup')
  @RateLimit(ASSISTANT_RATE_LIMIT)
  @Post('job-draft')
  async jobDraft(@CurrentUser() user: AuthUser, @Body() dto: JobDraftDto, @Res() res: Response) {
    await stream(res, (emit) => this.assistant.jobDraft(user, dto, emit));
  }

  /**
   * A delivery report from the expert's notes, streamed like the job draft:
   * the note once it passes its checks, then every KPI's result.
   */
  @Roles('specialist')
  @RateLimit(ASSISTANT_RATE_LIMIT)
  @Post('delivery-report')
  async deliveryReport(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeliveryReportDto,
    @Res() res: Response,
  ) {
    await stream(res, (emit) => this.assistant.deliveryReport(user, dto, emit));
  }

  /** How a suggestion ended up, sent with the job or the delivery it became. */
  @HttpCode(204)
  @Post('suggestions/:id/outcome')
  outcome(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OutcomeDto,
  ) {
    return this.assistant.outcome(user, id, dto);
  }
}

/**
 * Runs `work`, writing each event it emits as a line. Nothing is written until
 * the first event, so an error thrown before it (a refused request) becomes
 * the usual JSON error with its status. Proxies are asked not to buffer, so
 * every line reaches the browser as it is written.
 */
async function stream(
  res: Response,
  work: (emit: (event: AssistantEvent) => void) => Promise<void>,
): Promise<void> {
  let started = false;
  const emit = (event: AssistantEvent) => {
    if (!started) {
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
  try {
    await work(emit);
  } catch (error) {
    if (!started) throw error;
    emit({ type: 'error', message: 'No pudimos armar la sugerencia. Intenta con otras palabras.' });
  }
  res.end();
}
