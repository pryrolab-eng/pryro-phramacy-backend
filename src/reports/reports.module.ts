import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AccountingModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
