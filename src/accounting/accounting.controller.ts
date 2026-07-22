import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AccountingService } from "./accounting.service";
import {
  AccountingExpensesResponseDto,
  AccountingSummaryResponseDto,
  CreateAccountingExpenseDto,
  CreateAccountingExpenseResponseDto,
  DeleteAccountingExpenseResponseDto,
} from "./dto";

function monthStart(offset: number): Date {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

@ApiTags("Accounting")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("accounting")
export class AccountingController {
  constructor(
    private readonly service: AccountingService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the three-month accounting summary" })
  @ApiOkResponse({ type: AccountingSummaryResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async summary(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const summary = await this.service.buildSummary(pharmacyId, {
        from: monthStart(-2),
        to: monthStart(1),
      });
      const monthlyBreakdown = await Promise.all(
        [-2, -1, 0].map(async (offset) => {
          const from = monthStart(offset);
          const month = await this.service.buildSummary(pharmacyId, {
            from,
            to: monthStart(offset + 1),
          });
          return {
            month: from.toLocaleString("en", { month: "short" }),
            revenue: month.revenue,
            expenses: month.expenses,
            profit: month.profit,
            expenseSource:
              month.expenses > 0
                ? "purchase_orders_and_salary_estimate"
                : "live_or_unavailable",
          };
        }),
      );
      return {
        revenue: summary.revenue,
        expenses: summary.expenses,
        profit: summary.profit,
        profitMargin: summary.profitMargin,
        monthlyBreakdown,
        expenseCategories: summary.categoryBreakdown,
        sources: summary.sources,
        paymentSummary: summary.paymentSummary,
        cashFlow: summary.cashFlow,
      };
    } catch (error) {
      console.error("GET /api/accounting", error);
      throw new HttpException({ error: "Failed to fetch accounting data" }, 500);
    }
  }

  @Get("expenses")
  @ApiOperation({ summary: "List manual accounting expenses" })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiOkResponse({ type: AccountingExpensesResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async expenses(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const rows = await this.service.listExpenses(
        await this.tenant.requirePharmacyId(user.id),
        { from: parseDate(from), to: parseDate(to) },
      );
      return {
        expenses: rows.map((row) => ({
          id: row.id,
          category: row.category,
          amount: Number(row.amount),
          description: row.description,
          expenseDate: row.expense_date,
          source: row.source,
        })),
      };
    } catch (error) {
      console.error("GET /api/accounting/expenses", error);
      throw new HttpException({ error: "Failed to load accounting expenses" }, 500);
    }
  }

  @Post("expenses")
  @HttpCode(200)
  @ApiOperation({ summary: "Create a manual accounting expense" })
  @ApiBody({ type: CreateAccountingExpenseDto })
  @ApiOkResponse({ type: CreateAccountingExpenseResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async createExpense(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const category = String(body.category ?? "").trim();
      const amount = Number(body.amount);
      if (!category || !Number.isFinite(amount) || amount < 0) {
        throw new HttpException(
          { error: "category and a non-negative amount are required" },
          400,
        );
      }
      const expense = await this.service.createExpense({
        pharmacyId: await this.tenant.requirePharmacyId(user.id),
        category,
        amount,
        description:
          typeof body.description === "string" ? body.description.trim() : null,
        expenseDate:
          typeof body.expenseDate === "string" ? body.expenseDate : null,
        createdBy: user.id,
      });
      return {
        success: true,
        expense: {
          id: expense.id,
          category: expense.category,
          amount: Number(expense.amount),
          description: expense.description,
          expenseDate: expense.expense_date,
          source: expense.source,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/accounting/expenses", error);
      throw new HttpException({ error: "Failed to create accounting expense" }, 500);
    }
  }

  @Delete("expenses/:id")
  @ApiOperation({ summary: "Delete a manual accounting expense" })
  @ApiOkResponse({ type: DeleteAccountingExpenseResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async deleteExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    try {
      const deleted = await this.service.deleteExpense(
        id,
        await this.tenant.requirePharmacyId(user.id),
      );
      if (!deleted) {
        throw new HttpException({ error: "Expense not found" }, 404);
      }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("DELETE /api/accounting/expenses/[id]", error);
      throw new HttpException({ error: "Failed to delete accounting expense" }, 500);
    }
  }
}
