import { Module } from "@nestjs/common";
import { StaffInviteService } from "./staff-invite.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  controllers: [StaffController],
  providers: [StaffService, StaffInviteService],
  exports: [StaffInviteService],
})
export class StaffModule {}
