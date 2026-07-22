import { Module } from "@nestjs/common";
import { AiChatController } from "./ai-chat.controller";
import { AiSafetyController } from "./ai-safety.controller";
import { AiThreadsController } from "./ai-threads.controller";
import { AiSafetyService } from "./ai-safety.service";
import { AiService } from "./ai.service";
import { AiToolsService } from "./ai-tools.service";

@Module({
  controllers: [AiChatController, AiThreadsController, AiSafetyController],
  providers: [AiService, AiToolsService, AiSafetyService],
})
export class AiModule {}
