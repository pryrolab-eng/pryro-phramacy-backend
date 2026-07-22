import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";
import { SessionTokenService } from "./session-token.service";
import { AuthTokensService } from "./auth-tokens.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionTokenService, SessionGuard, AuthTokensService],
  exports: [AuthService, SessionGuard, SessionTokenService, AuthTokensService],
})
export class AuthModule {}
