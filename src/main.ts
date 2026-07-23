import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { IoAdapter } from "@nestjs/platform-socket.io";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { OriginGuard } from "./common/origin.guard";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService);

  // Required for Socket.IO WebSocket gateway to work correctly
  app.useWebSocketAdapter(new IoAdapter(app));

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalGuards(app.get(OriginGuard));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Pryrox Pharmacy API")
    .setDescription(
      "REST API for Pryrox pharmacy operations. Protected endpoints authenticate with the HttpOnly pryrox_session cookie issued by the Next.js application.",
    )
    .setVersion("1.0")
    .addServer(`${config.serverUrl}${config.nodeEnv == "production" ? "" : `:${config.port}`}`, `${config.nodeEnv} server`)
    .addCookieAuth(
      "pryrox_session",
      {
        type: "apiKey",
        in: "cookie",
        description:
          "Native Pryrox session JWT. In production the cookie name is __Secure-pryrox_session.",
      },
      "pryrox_session",
    )
    .addTag("Health", "Service liveness and database readiness")
    .addTag("Authentication", "Current authenticated user, session bootstrap, email/password management, 2FA verification, and recovery emails")
    .addTag("Categories", "Pharmacy medication category catalog")
    .addTag("Alerts", "Dashboard and inventory stock alerts")
    .addTag("Search", "Tenant-scoped global search")
    .addTag("Entitlements", "Subscription plan features and limits")
    .addTag("Me", "Current user profile and workplace context")
    .addTag("Notifications", "Notifications, preferences, push subscriptions, and SSE")
    .addTag("Inventory", "Inventory stock, imports, transfers, and analytics")
    .addTag("Customers", "Customer records, history, loyalty, and imports")
    .addTag("Prescriptions", "Prescription records and fulfillment status")
    .addTag("Sales", "Sales listing, combined views, and analytics")
    .addTag("POS", "Point of sale: products, sales, shifts, returns, voids")
    .addTag("Insurance", "Insurance providers, coverage, formulary, and claims")
    .addTag("Branches", "Branch profile updates and branch inventory")
    .addTag("Staff", "Pharmacy staff, branch access, and invitations")
    .addTag("Pharmacist", "Pharmacist dashboard, prescriptions, chart data, activities, and staff invitations")
    .addTag("Pharmacy", "Pharmacy dashboard, settings, branding, invoice templates, activity logs, and seed demo data")
    .addTag("Exports", "Export pharmacy data as CSV or JSON")
    .addTag("Accounting", "Revenue, expenses, profit, and cash flow")
    .addTag("Reports", "Sales, inventory, financial, tax, audit, and insurance reports")
    .addTag("Analytics", "Pharmacy analytics dashboard and insights")
    .addTag("Invoices", "Billing history and payment records")
    .addTag("Plans", "Subscription plans catalog")
    .addTag("Settings", "Security, 2FA, IP whitelist, integrations, locations, and report schedules")
    .addTag("Subscriptions", "Subscription plan limits, status, upgrades, downgrades, scheduled changes, and branch add-ons")
    .addTag("Polar", "Polar card payment checkout, status, and webhooks")
    .addTag("SaaS", "SaaS subscription engine: plans, subscriptions, branches, usage, invoices, and admin controls")
    .addTag("Integrations V1", "Platform API key-authenticated integration endpoints (health, discovery, pharmacies, inventory, sales, webhooks)")
    .addTag("RRA EBM", "RRA EBM (VSDC) sale submission")
    .addTag("Mobile Money", "Mobile money payment simulation")
    .addTag("Realtime", "Polling endpoints for realtime dashboard updates")
    .addTag("Onboarding", "Pharmacy tenant onboarding: status check and pharmacy creation")
    .addTag("Branding", "Public platform branding: name, logo, and support email")
    .addTag("Validation", "Phone number and card validation utilities")
    .addTag("AI", "AI chat, threads, messages, and drug safety checks")
    .addTag("Cron", "Scheduled background jobs (cron-triggered endpoints)")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, "")}_${methodKey}`,
  });
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
    yamlDocumentUrl: "api/docs-yaml",
    customSiteTitle: "Pryrox API Documentation",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tagsSorter: "alpha",
      operationsSorter: "method",
    },
  });

  await app.listen(config.port);
}

void bootstrap();
