import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function decimal(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async billingHistory(pharmacyId: string) {
    const limit = 20;

    const [invoices, transactions, paymentMethod, activeSub] =
      await Promise.all([
        this.prisma.invoices.findMany({
          where: { pharmacy_id: pharmacyId },
          orderBy: { created_at: "desc" },
          take: limit,
        }),
        this.prisma.payment_transactions.findMany({
          where: {
            pharmacy_id: pharmacyId,
            status: { in: ["completed", "processing", "pending", "failed"] },
          },
          orderBy: { created_at: "desc" },
          take: limit,
          select: {
            id: true,
            amount: true,
            status: true,
            payment_details: true,
            payment_provider: true,
            payment_method: true,
            created_at: true,
            completed_at: true,
            customer_email: true,
          },
        }),
        this.prisma.payment_methods.findFirst({
          where: { pharmacy_id: pharmacyId, is_default: true },
        }),
        this.prisma.subscriptions.findFirst({
          where: { pharmacy_id: pharmacyId, is_active: true },
          orderBy: { created_at: "desc" },
          select: { expires_at: true, payment_method: true },
        }),
      ]);

    const invoiceHistory = invoices.map((inv) => ({
      id: inv.id,
      date: (inv.created_at ?? inv.due_date).toISOString().split("T")[0],
      amount: decimal(inv.amount),
      status: inv.status === "paid" ? "Paid" : String(inv.status ?? "pending"),
      planName: inv.plan_name,
      provider: "invoice",
      invoiceNumber: inv.invoice_number,
      source: "invoice" as const,
    }));

    const txHistory = transactions
      .filter(
        (tx) =>
          !invoiceHistory.some(
            (i) =>
              i.id === tx.id ||
              i.invoiceNumber?.includes(tx.id.slice(0, 8)),
          ),
      )
      .map((tx) => {
        const details = tx.payment_details ?? "Subscription";
        const planMatch = details.match(/^(.+?)\s+subscription/i);
        const paidAt = tx.completed_at ?? tx.created_at ?? new Date();
        return {
          id: tx.id,
          date: paidAt.toISOString().split("T")[0],
          amount: decimal(tx.amount),
          status:
            tx.status === "completed"
              ? "Paid"
              : String(tx.status ?? "pending").charAt(0).toUpperCase() +
                String(tx.status ?? "pending").slice(1),
          planName: planMatch?.[1]?.trim() || details,
          provider: tx.payment_provider || tx.payment_method || "payment",
          source: "transaction" as const,
        };
      });

    const history = [...invoiceHistory, ...txHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const nextPending = invoices.find((inv) => inv.status === "pending");

    return {
      history,
      nextPendingDueDate: nextPending?.due_date
        ? nextPending.due_date.toISOString().split("T")[0]
        : null,
      nextPendingAmount: nextPending ? decimal(nextPending.amount) : null,
      activeExpiresAt: activeSub?.expires_at?.toISOString() ?? null,
      activePaymentMethod: activeSub?.payment_method ?? null,
      defaultPaymentMethodType: paymentMethod?.method_type ?? null,
    };
  }
}
