import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValidationService } from "./validation.service";
import { ValidateDto } from "./dto/validate.dto";

@ApiTags("Validation")
@Controller("validation")
export class ValidationController {
  constructor(private readonly validation: ValidationService) {}

  /** Validate a phone number and/or card details. No auth required. */
  @Post("phone")
  @ApiOperation({ summary: "Validate phone and/or card details" })
  validate(@Body() dto: ValidateDto) {
    const results: Record<string, unknown> = {};

    if (dto.phoneNumber) {
      results["phone"] = this.validation.validatePhone(dto.phoneNumber);
    }

    if (dto.cardNumber) {
      results["card"] = this.validation.validateCard(
        dto.cardNumber,
        dto.expiryMonth,
        dto.expiryYear,
        dto.cvv,
        dto.holderName,
      );
    }

    return results;
  }
}
