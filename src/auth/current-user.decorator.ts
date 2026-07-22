import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AUTH_USER_REQUEST_KEY, type AuthUser } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { [AUTH_USER_REQUEST_KEY]?: AuthUser }>();
    const user = request[AUTH_USER_REQUEST_KEY];
    if (!user) {
      throw new Error("CurrentUser used without SessionGuard");
    }
    return user;
  },
);
