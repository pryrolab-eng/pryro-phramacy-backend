import { ApiProperty } from "@nestjs/swagger";

class InventoryUpdateRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() quantityInStock!: number;
  @ApiProperty({ nullable: true }) updatedAt!: string | null;
}

class NewSaleRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() totalAmount!: number;
  @ApiProperty({ nullable: true }) createdAt!: string | null;
}

class RealtimeUpdateDto {
  @ApiProperty() type!: string;
  @ApiProperty() data!: InventoryUpdateRowDto[] | NewSaleRowDto[];
}

export class RealtimeUpdatesResponseDto {
  @ApiProperty({ type: [RealtimeUpdateDto] }) updates!: RealtimeUpdateDto[];
}
