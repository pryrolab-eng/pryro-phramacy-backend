import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on("finish", () => {
      const ms = Date.now() - start;
      const { statusCode } = res;

      // Colour-code by status range
      const status =
        statusCode >= 500
          ? `\x1b[31m${statusCode}\x1b[0m` // red
          : statusCode >= 400
            ? `\x1b[33m${statusCode}\x1b[0m` // yellow
            : statusCode >= 300
              ? `\x1b[36m${statusCode}\x1b[0m` // cyan
              : `\x1b[32m${statusCode}\x1b[0m`; // green

      const duration =
        ms > 1000
          ? `\x1b[31m${ms}ms\x1b[0m`   // red  — slow
          : ms > 300
            ? `\x1b[33m${ms}ms\x1b[0m` // yellow — moderate
            : `${ms}ms`;               // default — fast

      this.logger.log(`${method} ${originalUrl} ${status} ${duration}`);
    });

    next();
  }
}
