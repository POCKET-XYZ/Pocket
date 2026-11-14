import { Module } from '@nestjs/common';
import { AssistantAdminController } from './assistant-admin.controller';
import { AssistantAdminService } from './assistant-admin.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantModel } from './model.client';

/** The Pocket assistant on Claude: it suggests, people decide. */
@Module({
  controllers: [AssistantController, AssistantAdminController],
  providers: [AssistantService, AssistantAdminService, AssistantModel],
})
export class AssistantModule {}
