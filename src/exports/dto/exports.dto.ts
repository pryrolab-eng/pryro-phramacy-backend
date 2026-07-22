import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateExportDto {
  @ApiPropertyOptional({ enum: ["sales", "customers", "inventory"], default: "sales" })
  type?: string;

  @ApiPropertyOptional({ enum: ["csv", "json"], default: "csv" })
  format?: string;
}

export class ExportResultDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: "object", additionalProperties: true })
  export!: {
    id: string;
    type: string;
    format: string;
    filename: string;
    size: string;
    rowCount: number;
    downloadUrl: string;
    createdAt: string;
    status: string;
  };
}
