import { Global, Module } from "@nestjs/common";
import { PharmacyPermissionService } from "./pharmacy-permission.service";
import { TenantContextService } from "./tenant-context.service";

@Global()
@Module({
  providers: [TenantContextService, PharmacyPermissionService],
  exports: [TenantContextService, PharmacyPermissionService],
})
export class TenantModule {}
