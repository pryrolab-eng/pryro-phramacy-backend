import { ApiProperty } from "@nestjs/swagger";

export class LivenessResponseDto {
  @ApiProperty({ description: "Liveness state.", example: "ok", enum: ["ok"] })
  status!: "ok";
}
export class ReadinessResponseDto {
  @ApiProperty({ description: "Readiness state.", example: "ok", enum: ["ok"] })
  status!: "ok";
  @ApiProperty({ description: "Database connectivity state.", example: "connected", enum: ["connected"] })
  database!: "connected";
}
export class ReadinessFailureResponseDto {
  @ApiProperty({ description: "Readiness state.", example: "error", enum: ["error"] })
  status!: "error";
  @ApiProperty({ description: "Database connectivity state.", example: "disconnected", enum: ["disconnected"] })
  database!: "disconnected";
}
export class HttpErrorResponseDto {
  @ApiProperty({ description: "HTTP status code.", example: 500 }) statusCode!: number;
  @ApiProperty({ description: "Failure message.", example: "Internal server error" }) message!: string;
}
