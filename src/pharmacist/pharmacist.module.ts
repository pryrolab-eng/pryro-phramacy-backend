import { Module } from "@nestjs/common";
import { StaffModule } from "../staff/staff.module";
import { PharmacistController } from "./pharmacist.controller";
import { PharmacistService } from "./pharmacist.service";

@Module({
  imports: [StaffModule],
  controllers: [PharmacistController],
  providers: [PharmacistService],
})
export class PharmacistModule {}
