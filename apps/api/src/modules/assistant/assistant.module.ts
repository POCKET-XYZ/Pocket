import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantModel } from './model.client';

/** The Pocket assistant on Claude: it suggests, people decide. */
@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantModel],
})
export class AssistantModule {}
