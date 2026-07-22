import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSupplierDto {
  @ApiProperty({ description: "Supplier business name.", example: "MediSource Wholesale Ltd" })
  name!: string;

  @ApiPropertyOptional({ description: "Primary contact person's name.", example: "Amina Yusuf" })
  contact?: string;

  @ApiPropertyOptional({ description: "Supplier contact phone number.", example: "+234 803 555 0142" })
  phone?: string;

  @ApiPropertyOptional({ description: "Supplier contact email.", example: "orders@medisource.example", format: "email" })
  email?: string;
}
