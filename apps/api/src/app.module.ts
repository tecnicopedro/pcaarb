import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { AbilityGuard } from './common/guards/ability.guard';
import { AbilityFactory } from './common/casl/ability.factory';
import { DrizzleModule } from './database/drizzle.module';
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CashSessionsModule } from './modules/cash-sessions/cash-sessions.module';
import { SalesModule } from './modules/sales/sales.module';
import { StockModule } from './modules/stock/stock.module';
import { FinanceModule } from './modules/finance/finance.module';
import { CostCentersModule } from './modules/cost-centers/cost-centers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StockCountsModule } from './modules/stock-counts/stock-counts.module';
import { PermissionOverridesModule } from './modules/permission-overrides/permission-overrides.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { BillingModule } from './modules/billing/billing.module';
import { StoresModule } from './modules/stores/stores.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    DrizzleModule,
    HealthModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CustomersModule,
    SuppliersModule,
    CashSessionsModule,
    SalesModule,
    StockModule,
    FinanceModule,
    CostCentersModule,
    PurchaseOrdersModule,
    ReportsModule,
    StockCountsModule,
    PermissionOverridesModule,
    LoyaltyModule,
    CommissionsModule,
    BillingModule,
    StoresModule,
    MarketplaceModule,
    ApiKeysModule,
    AuditLogModule,
  ],
  providers: [
    AbilityFactory,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AbilityGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
