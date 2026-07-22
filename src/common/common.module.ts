import { Global, Module } from "@nestjs/common";
import { OriginGuard } from "./origin.guard";

@Global()
@Module({
  providers: [OriginGuard],
  exports: [OriginGuard],
})
export class CommonModule {}
