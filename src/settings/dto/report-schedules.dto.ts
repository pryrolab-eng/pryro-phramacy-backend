import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReportScheduleDto {
  @ApiProperty() id!: string;
  @ApiProperty() reportType!: string;
  @ApiProperty() frequency!: string;
  @ApiProperty({ type: [String] }) recipients!: string[];
  @ApiProperty() isActive!: boolean;
}

export class ReportSchedulesListDto {
  @ApiProperty({ type: [ReportScheduleDto] })
  schedules!: ReportScheduleDto[];
}

export class UpsertReportScheduleDto {
  @ApiPropertyOptional({ default: "sales" })
  reportType?: string;

  @ApiProperty({ enum: ["off", "daily", "weekly", "monthly"] })
  frequency!: string;

  @ApiPropertyOptional({ type: [String] })
  recipients?: string[];

  @ApiPropertyOptional()
  isActive?: boolean;
}
