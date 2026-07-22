import { Module } from "@nestjs/common";
import { PharmacyBrandingService } from "../pharmacy/pharmacy-branding.service";
import { AdminService } from "./admin.service";
import { AdminPharmaciesController } from "./controllers/admin-pharmacies.controller";
import { AdminPlansBillingController } from "./controllers/admin-plans-billing.controller";
import { AdminPlatformController } from "./controllers/admin-platform.controller";
import { AdminContentController } from "./controllers/admin-content.controller";
import { SuperAdminController } from "./controllers/superadmin.controller";
import { RequirePlatformAdminGuard } from "./guards/require-platform-admin.guard";

@Module({
  controllers: [
    AdminPharmaciesController,
    AdminPlansBillingController,
    AdminPlatformController,
    AdminContentController,
    SuperAdminController,
  ],
  providers: [AdminService, RequirePlatformAdminGuard, PharmacyBrandingService],
})
export class AdminModule {}
