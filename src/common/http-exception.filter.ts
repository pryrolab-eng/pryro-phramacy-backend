import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { EntitlementError } from "../entitlements/entitlement.error";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof EntitlementError) {
      response.status(exception.status).json({
        error: exception.message,
        code: exception.code,
        ...(exception.upgradeFeature
          ? { upgradeFeature: exception.upgradeFeature }
          : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === "string" ? { error: body } : body);
      return;
    }

    const message =
      exception instanceof Error ? exception.message : "Internal server error";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (message.includes("Pharmacy not found")) {
      status = message.includes("No active pharmacy") ? 404 : 400;
    } else if (message === "Unauthorized") {
      status = HttpStatus.UNAUTHORIZED;
    } else if (
      message.includes("access") ||
      message.includes("Invalid") ||
      message.includes("not included")
    ) {
      status = HttpStatus.FORBIDDEN;
    } else if (message.includes("not found") || message.includes("Not found")) {
      status = HttpStatus.NOT_FOUND;
    }

    const payload =
      status === HttpStatus.BAD_REQUEST ||
      status === HttpStatus.NOT_FOUND ||
      status === HttpStatus.UNAUTHORIZED
        ? { error: message }
        : { success: false, error: message };

    response.status(status).json(payload);
  }
}
