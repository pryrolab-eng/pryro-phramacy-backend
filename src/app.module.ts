import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { LoggingMiddleware } from "./common/logging.middleware";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { TenantModule } from "./tenant/tenant.module";
import { AuditModule } from "./audit/audit.module";
import { CategoriesModule } from "./categories/categories.module";
import { AlertsModule } from "./alerts/alerts.module";
import { SearchModule } from "./search/search.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { MeModule } from "./me/me.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CustomersModule } from "./customers/customers.module";
import { BranchesModule } from "./branches/branches.module";
import { StaffModule } from "./staff/staff.module";
import { PrescriptionsModule } from "./prescriptions/prescriptions.module";
import { SalesModule } from "./sales/sales.module";
import { PosModule } from "./pos/pos.module";
import { InsuranceModule } from "./insurance/insurance.module";
import { PharmacistModule } from "./pharmacist/pharmacist.module";
import { PharmacyModule } from "./pharmacy/pharmacy.module";
import { ExportsModule } from "./exports/exports.module";
import { AccountingModule } from "./accounting/accounting.module";
import { ReportsModule } from "./reports/reports.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PlansModule } from "./plans/plans.module";
import { SettingsModule } from "./settings/settings.module";
import { BillingModule } from "./billing/billing.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { AdminModule } from "./admin/admin.module";
import { FilesModule } from "./files/files.module";
import { StorageModule } from "./storage/storage.module";
import { BrandingModule } from "./branding/branding.module";
import { ValidationModule } from "./validation/validation.module";
import { CronModule } from "./cron/cron.module";
import { AiModule } from "./ai/ai.module";
import { ClickhouseModule } from "./clickhouse/clickhouse.module";
import { MailModule } from "./mail/mail.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    TenantModule,
    AuditModule,
    HealthModule,
    CategoriesModule,
    AlertsModule,
    SearchModule,
    EntitlementsModule,
    MeModule,
    NotificationsModule,
    InventoryModule,
    CustomersModule,
    PrescriptionsModule,
    SalesModule,
    PosModule,
    InsuranceModule,
    BranchesModule,
    StaffModule,
    PharmacistModule,
    PharmacyModule,
    ExportsModule,
    AccountingModule,
    ReportsModule,
    AnalyticsModule,
    InvoicesModule,
    PlansModule,
    SettingsModule,
    BillingModule,
    IntegrationsModule,
    OnboardingModule,
    AdminModule,
    StorageModule,
    FilesModule,
    BrandingModule,
    ValidationModule,
    CronModule,
    AiModule,
    MailModule,
    MaintenanceModule,
    ClickhouseModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
