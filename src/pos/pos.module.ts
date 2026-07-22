import { Module } from "@nestjs/common";
import { PosController } from "./pos.controller";
import { PosSaleService } from "./pos-sale.service";
import { PosService } from "./pos.service";

@Module({
  controllers: [PosController],
  providers: [PosService, PosSaleService],
})
export class PosModule {}
