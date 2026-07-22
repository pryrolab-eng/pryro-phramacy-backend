import { Module } from "@nestjs/common";
import { InventoryService } from "../inventory/inventory.service";
import { BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, InventoryService],
})
export class BranchesModule {}
