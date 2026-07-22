import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CustomersService } from "../customers/customers.service";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantModule } from "../tenant/tenant.module";
import { PharmacyBrandingService } from "./pharmacy-branding.service";
import { PharmacyController } from "./pharmacy.controller";
import { PharmacyService } from "./pharmacy.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenantModule,
    EntitlementsModule,
    AuditModule,
  ],
  controllers: [PharmacyController],
  providers: [
    PharmacyService,
    PharmacyBrandingService,
    InventoryService,
    CustomersService,
  ],
  exports: [PharmacyService, PharmacyBrandingService],
})
export class PharmacyModule {}
