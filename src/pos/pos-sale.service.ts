import { HttpException, Injectable } from "@nestjs/common";
import type {
  payment_method,
  return_disposition,
  return_type,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  computeDaysToExpiry,
  defaultDispositionForReason,
  isDispositionAllowed,
  stockMovementTypeForDisposition,
  type CoverageLineResult,
  type PrescriptionConfirmation,
  type ReturnLinePayload,
  type SaleLine,
} from "./models/pos.types";
import { PosService } from "./pos.service";

const SHIFT_REQUIRED_CODE = "SHIFT_REQUIRED";
const SHIFT_REQUIRED_MESSAGE =
  "Open a cashier shift before processing POS transactions.";

@Injectable()
export class PosSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pos: PosService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  private paymentMethod(method: string): payment_method {
    if (method === "mobile") return "mobile_money";
    if (method === "split") return "mixed";
    if (method === "card") return "card";
    if (method === "insurance") return "insurance";
    return "cash";
  }

  private returnType(type: string): return_type {
    if (type === "refund") return "refund";
    if (type === "exchange") return "exchange";
    return "return";
  }

  private validateCartRules(
    items: SaleLine[],
    confirmation: PrescriptionConfirmation | undefined,
    nearExpiryAcknowledged: boolean,
  ) {
    const expired = items.filter((item) => (item.daysToExpiry ?? 9999) < 0);
    if (expired.length) {
      throw new HttpException(
        {
          error: `Cannot sell expired stock: ${expired
            .map((item) => item.name)
            .join(", ")}`,
        },
        400,
      );
    }
    if (
      items.some((item) => {
        const days = item.daysToExpiry ?? 9999;
        return days >= 0 && days <= 30;
      }) &&
      !nearExpiryAcknowledged
    ) {
      throw new HttpException(
        {
          error:
            "Near-expiry items in cart. Confirm acknowledgement before completing the sale.",
          code: "NEAR_EXPIRY_ACK_REQUIRED",
        },
        400,
      );
    }
    const rxItems = items.filter((item) => item.requiresPrescription);
    if (rxItems.length && !confirmation?.confirmed) {
      throw new HttpException(
        {
          error: `Prescription confirmation required for: ${
            rxItems.map((item) => item.name).filter(Boolean).join(", ") ||
            "controlled items"
          }`,
          code: "PRESCRIPTION_REQUIRED",
        },
        400,
      );
    }
    if (rxItems.length && !confirmation?.prescriberName?.trim()) {
      throw new HttpException(
        {
          error: `Prescriber / doctor name is required for: ${
            rxItems.map((item) => item.name).filter(Boolean).join(", ") ||
            "controlled items"
          }`,
          code: "PRESCRIPTION_REQUIRED",
        },
        400,
      );
    }
  }

  async processSale(
    userId: string,
    body: Record<string, unknown>,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const branchId =
      typeof body.branch_id === "string"
        ? body.branch_id
        : typeof body.branchId === "string"
          ? body.branchId
          : null;
    if (!branchId) {
      throw new HttpException(
        { error: "branchId is required for POS sales" },
        400,
      );
    }

    // TODO: Port subscription monthly transaction consumption when the Nest
    // entitlement service exposes the Next.js `consumeTransaction` behavior.
    const { pharmacyId } = await this.pos.requireFeature(
      userId,
      "pos.access",
      branchId,
    );
    const customer =
      body.customer && typeof body.customer === "object"
        ? (body.customer as Record<string, unknown>)
        : undefined;
    const saleItems = Array.isArray(body.items)
      ? (body.items as SaleLine[])
      : [];
    const confirmation =
      body.prescriptionConfirmation &&
      typeof body.prescriptionConfirmation === "object"
        ? (body.prescriptionConfirmation as PrescriptionConfirmation)
        : undefined;
    if (!saleItems.length) {
      throw new HttpException({ error: "Cart is empty" }, 400);
    }
    this.validateCartRules(
      saleItems,
      confirmation,
      body.nearExpiryAcknowledged === true,
    );

    const usesInsurance =
      (customer?.insuranceType && customer.insuranceType !== "cash") ||
      Number(body.insuranceCoverage) > 0 ||
      Number(body.insuranceAmount) > 0;
    if (usesInsurance) {
      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "pos.insurance",
      });
    }

    const inventoryRows = await this.prisma.inventory.findMany({
      where: { id: { in: saleItems.map((item) => item.id) } },
      select: {
        id: true,
        pharmacy_id: true,
        branch_id: true,
        batch_number: true,
        quantity_in_stock: true,
        expiry_date: true,
        medication_id: true,
        medications: {
          select: { id: true, name: true, requires_prescription: true },
        },
      },
    });
    const inventoryById = new Map(
      inventoryRows.map((row) => [row.id, row]),
    );
    const today = new Date().toISOString().slice(0, 10);
    for (const item of saleItems) {
      const inventory = inventoryById.get(item.id);
      if (!inventory) {
        throw new HttpException(
          { error: `Product not found: ${item.name ?? item.id}` },
          400,
        );
      }
      if (
        inventory.pharmacy_id !== pharmacyId ||
        inventory.branch_id !== branchId
      ) {
        throw new HttpException(
          {
            error: `${item.name ?? "Item"} is not in stock at the selected branch`,
          },
          400,
        );
      }
      const expiry = inventory.expiry_date?.toISOString().slice(0, 10) ?? null;
      if (computeDaysToExpiry(expiry) < 0) {
        throw new HttpException(
          {
            error: `Cannot sell expired batch for ${
              item.name ?? "item"
            } (${inventory.batch_number})`,
          },
          400,
        );
      }
      if (
        inventory.medications?.requires_prescription &&
        !confirmation?.confirmed
      ) {
        throw new HttpException(
          {
            error: `Prescription required for ${item.name ?? "item"}`,
            code: "PRESCRIPTION_REQUIRED",
          },
          400,
        );
      }
      if ((inventory.quantity_in_stock ?? 0) < item.quantity) {
        throw new HttpException(
          {
            error: `Insufficient stock for ${item.name ?? "item"} (batch ${
              inventory.batch_number
            })`,
          },
          400,
        );
      }
      if (expiry && expiry < today) {
        throw new HttpException(
          { error: `Batch ${inventory.batch_number} is expired` },
          400,
        );
      }
    }

    let insuranceProviderId: string | null = null;
    let resolvedInsuranceCoverage =
      Number.parseFloat(String(body.insuranceCoverage)) || 0;
    let resolvedPatientAmount =
      Number.parseFloat(String(body.patientAmount)) ||
      Number.parseFloat(String(body.subtotal)) ||
      0;
    let resolvedSubtotal = Number.parseFloat(String(body.subtotal)) || 0;
    let coverageLines: CoverageLineResult[] = [];

    if (customer?.insuranceType && customer.insuranceType !== "cash") {
      const providerKey = String(customer.insuranceType);
      const coverage = await this.pos.computeCoverage({
        pharmacyId,
        providerKey,
        lines: saleItems
          .map((item) => {
            const inventory = inventoryById.get(item.id);
            return {
              inventoryId: item.id,
              medicationId:
                inventory?.medications?.id ??
                inventory?.medication_id ??
                "",
              medicationName: item.name,
              quantity: item.quantity,
              shelfUnitPrice: item.price ?? 0,
            };
          })
          .filter((line) => Boolean(line.medicationId)),
      });
      const provider = await this.pos.resolveProvider(pharmacyId, providerKey);
      insuranceProviderId = provider?.id ?? null;
      if (coverage) {
        resolvedSubtotal = coverage.subtotal;
        resolvedInsuranceCoverage = coverage.insuranceCoverage;
        resolvedPatientAmount = coverage.patientCopay;
        coverageLines = coverage.lines;
      }
    }

    const openShift = await this.prisma.cashier_shifts.findFirst({
      where: { cashier_id: userId, branch_id: branchId, status: "open" },
    });
    if (!openShift) {
      throw new HttpException(
        { error: SHIFT_REQUIRED_MESSAGE, code: SHIFT_REQUIRED_CODE },
        403,
      );
    }

    const dbPaymentMethod = this.paymentMethod(
      String(body.paymentMethod ?? "cash"),
    );
    const notes: string[] = [];
    if (customer?.insuranceNumber) {
      notes.push(`Insurance: ${String(customer.insuranceNumber)}`);
    }
    if (confirmation?.confirmed) {
      notes.push("Rx confirmed");
      if (confirmation.patientName) {
        notes.push(`Patient: ${confirmation.patientName}`);
      }
      if (confirmation.prescriberName) {
        notes.push(`Prescriber: ${confirmation.prescriberName}`);
      }
      if (confirmation.notes) notes.push(confirmation.notes);
    }
    if (dbPaymentMethod === "mixed") {
      notes.push(
        `Split cash: ${String(body.cashAmount ?? 0)}, insurance/other: ${String(
          body.insuranceAmount ?? 0,
        )}`,
      );
    }

    const receiptNumber = `RCP-${Date.now()}`;
    const saleTotal =
      Number.parseFloat(String(body.patientAmount)) ||
      Number.parseFloat(String(body.subtotal)) ||
      0;
    let customerId: string | null = null;
    let payerName =
      typeof customer?.name === "string" ? customer.name.trim() : "";
    let payerPhone =
      typeof customer?.phone === "string" ? customer.phone.trim() : null;
    if (typeof customer?.id === "string" && customer.id.trim()) {
      const registered = await this.prisma.customers.findFirst({
        where: { id: customer.id.trim(), pharmacy_id: pharmacyId },
        select: { id: true, name: true, phone: true },
      });
      if (registered) {
        customerId = registered.id;
        payerName = registered.name;
        payerPhone = registered.phone ?? payerPhone;
      }
    }
    const payerDisplayName =
      !payerName ||
      ["walk-in", "walk in", "walk-in customer"].includes(
        payerName.toLowerCase(),
      )
        ? "Walk-in Customer"
        : payerName;
    const patientName = confirmation?.patientName?.trim() || null;

    const { sale, saleItemIdByInventoryId } =
      await this.prisma.$transaction(async (tx) => {
        const createdSale = await tx.sales.create({
          data: {
            pharmacy_id: pharmacyId,
            branch_id: branchId,
            cashier_id: userId,
            shift_id: openShift.id,
            customer_id: customerId,
            customer_name: payerDisplayName,
            customer_phone: payerPhone || null,
            patient_name: patientName,
            insurance_provider_id: insuranceProviderId,
            subtotal: resolvedSubtotal,
            insurance_amount: resolvedInsuranceCoverage,
            customer_amount: resolvedPatientAmount,
            total_amount: resolvedSubtotal,
            payment_method: dbPaymentMethod,
            status: "completed",
            receipt_number: receiptNumber,
            notes: notes.length ? notes.join(" | ") : null,
          },
        });
        const saleItemIds = new Map<string, string>();
        for (const item of saleItems) {
          const inserted = await tx.sale_items.create({
            data: {
              sale_id: createdSale.id,
              inventory_id: item.id,
              medication_name: item.name ?? "Unknown",
              quantity: item.quantity,
              unit_price: item.price ?? 0,
              total_price: item.quantity * (item.price ?? 0),
              batch_number: item.batch ?? null,
              expiry_date: item.expiryDate
                ? new Date(item.expiryDate)
                : null,
            },
            select: { id: true, inventory_id: true },
          });
          if (inserted.inventory_id) {
            saleItemIds.set(inserted.inventory_id, inserted.id);
          }
          const current = inventoryById.get(item.id)!;
          await tx.inventory.update({
            where: { id: item.id },
            data: {
              quantity_in_stock: Math.max(
                0,
                (current.quantity_in_stock ?? 0) - item.quantity,
              ),
            },
          });
          await tx.stock_movements.create({
            data: {
              pharmacy_id: pharmacyId,
              inventory_id: item.id,
              movement_type: "out",
              quantity: item.quantity,
              reference_id: createdSale.id,
              reference_type: "sale",
              notes: `POS sale ${receiptNumber}`,
              created_by: userId,
            },
          });
        }
        await tx.cashier_shifts.update({
          where: { id: openShift.id },
          data: {
            total_sales: Number(openShift.total_sales ?? 0) + saleTotal,
            transaction_count: Number(openShift.transaction_count ?? 0) + 1,
          },
        });
        return {
          sale: createdSale,
          saleItemIdByInventoryId: saleItemIds,
        };
      });

    if (
      typeof body.paymentTransactionId === "string" &&
      body.paymentTransactionId
    ) {
      try {
        await this.prisma.payment_transactions.update({
          where: { id: body.paymentTransactionId },
          data: { sale_id: sale.id },
        });
      } catch (error) {
        console.error("Failed to link payment transaction to sale:", error);
      }
    }

    if (insuranceProviderId && resolvedInsuranceCoverage > 0) {
      try {
        const claim = await this.prisma.insurance_claims.create({
          data: {
            pharmacy_id: pharmacyId,
            sale_id: sale.id,
            insurance_provider_id: insuranceProviderId,
            patient_name: patientName || payerDisplayName,
            patient_id_number:
              typeof customer?.insuranceNumber === "string"
                ? customer.insuranceNumber
                : null,
            claim_amount: resolvedInsuranceCoverage,
            covered_amount: resolvedInsuranceCoverage,
            patient_copay: resolvedPatientAmount,
            approved_amount: 0,
            status: "pending",
            metadata: {},
          },
          select: { id: true },
        });
        if (coverageLines.length) {
          const medications = await this.prisma.medications.findMany({
            where: {
              id: { in: coverageLines.map((line) => line.medicationId) },
            },
            select: { id: true, insurance_coverage: true },
          });
          const externalCodes = new Map(
            medications.map((row) => {
              const map =
                row.insurance_coverage &&
                typeof row.insurance_coverage === "object" &&
                !Array.isArray(row.insurance_coverage)
                  ? (row.insurance_coverage as Record<
                      string,
                      { externalCode?: string }
                    >)
                  : {};
              return [
                row.id,
                map[insuranceProviderId]?.externalCode ?? null,
              ];
            }),
          );
          await this.prisma.insurance_claim_lines.createMany({
            data: coverageLines.map((line) => ({
              claim_id: claim.id,
              sale_item_id: line.inventoryId
                ? (saleItemIdByInventoryId.get(line.inventoryId) ?? null)
                : null,
              medication_id: line.medicationId,
              medication_name: line.medicationName ?? null,
              quantity: line.quantity,
              is_covered: line.isCovered,
              shelf_unit_price: line.shelfUnitPrice,
              insured_unit_price: line.insuredUnitPrice,
              insurer_amount: line.insurerPays,
              patient_amount: line.patientPays,
              external_code: externalCodes.get(line.medicationId) ?? null,
            })),
          });
        }
      } catch (error) {
        console.error("Insurance claim error:", error);
      }
    }

    try {
      await this.awardLoyalty({
        pharmacyId,
        customerId,
        customerPhone: payerPhone,
        saleTotal,
      });
    } catch (error) {
      console.error("loyalty award:", error);
    }

    // TODO: Port Redis invalidation, sale notifications, EBM submission,
    // integration webhooks, and ClickHouse synchronization once those
    // infrastructure adapters are available in the Nest application.
    await this.audit.writeAuditLog({
      pharmacyId,
      userId,
      action: "INSERT",
      tableName: "sales",
      recordId: sale.id,
      newValues: {
        saleId: sale.id,
        receiptNumber,
        branchId,
        total: saleTotal,
        paymentMethod: dbPaymentMethod,
        itemCount: saleItems.length,
        ebm: null,
      },
      ...metadata,
    });
    return {
      success: true,
      sale,
      receiptNumber,
      ebm: null,
      message: "Sale processed successfully",
    };
  }

  private async awardLoyalty(input: {
    pharmacyId: string;
    customerId: string | null;
    customerPhone: string | null;
    saleTotal: number;
  }) {
    const customer = input.customerId
      ? await this.prisma.customers.findFirst({
          where: { pharmacy_id: input.pharmacyId, id: input.customerId },
          select: { id: true },
        })
      : input.customerPhone
        ? await this.prisma.customers.findFirst({
            where: {
              pharmacy_id: input.pharmacyId,
              phone: input.customerPhone,
            },
            select: { id: true },
          })
        : null;
    if (!customer) return;
    const points = Math.max(0, Math.floor(input.saleTotal / 100));
    if (!points) return;
    const existing = await this.prisma.customer_loyalty.findFirst({
      where: {
        pharmacy_id: input.pharmacyId,
        customer_id: customer.id,
      },
    });
    const nextPoints = Number(existing?.points ?? 0) + points;
    const tier =
      nextPoints >= 500 ? "Gold" : nextPoints >= 200 ? "Silver" : "Bronze";
    if (existing) {
      await this.prisma.customer_loyalty.update({
        where: { id: existing.id },
        data: {
          points: nextPoints,
          tier,
          total_spent:
            Number(existing.total_spent ?? 0) + Math.max(0, input.saleTotal),
          updated_at: new Date(),
        },
      });
    } else {
      await this.prisma.customer_loyalty.create({
        data: {
          pharmacy_id: input.pharmacyId,
          customer_id: customer.id,
          points: nextPoints,
          tier,
          total_spent: Math.max(0, input.saleTotal),
        },
      });
    }
  }

  async processReturn(userId: string, body: Record<string, unknown>) {
    const saleId =
      typeof body.saleId === "string" ? body.saleId : undefined;
    const branchId =
      typeof body.branchId === "string" ? body.branchId : undefined;
    const reason = typeof body.reason === "string" ? body.reason : "other";
    const returnType =
      typeof body.returnType === "string" ? body.returnType : "return";
    const notes = typeof body.notes === "string" ? body.notes : null;
    const refundAmount = Number(body.refundAmount) || 0;
    const refundMethod =
      typeof body.refundMethod === "string" ? body.refundMethod : null;
    const items = Array.isArray(body.items)
      ? (body.items as ReturnLinePayload[])
      : [];
    if (!saleId || !branchId) {
      throw new HttpException(
        { error: "saleId and branchId are required" },
        400,
      );
    }
    if (!items.length) {
      throw new HttpException(
        { error: "At least one return line is required" },
        400,
      );
    }
    const { pharmacyId } = await this.pos.requireFeature(
      userId,
      "pos.returns",
      branchId,
    );
    const openShift = await this.prisma.cashier_shifts.findFirst({
      where: { cashier_id: userId, branch_id: branchId, status: "open" },
    });
    if (!openShift) {
      throw new HttpException(
        { error: SHIFT_REQUIRED_MESSAGE, code: SHIFT_REQUIRED_CODE },
        403,
      );
    }
    const sale = await this.prisma.sales.findUnique({
      where: { id: saleId },
      include: { sale_items: true },
    });
    if (!sale) throw new HttpException({ error: "Sale not found" }, 404);
    if (
      sale.pharmacy_id !== pharmacyId ||
      sale.branch_id !== branchId
    ) {
      throw new HttpException(
        { error: "Sale does not belong to this branch" },
        400,
      );
    }
    if (sale.status !== "completed") {
      throw new HttpException(
        { error: "Only completed sales can be returned" },
        400,
      );
    }
    const saleItems = new Map(sale.sale_items.map((item) => [item.id, item]));
    const previous = await this.prisma.return_items.findMany({
      where: { sale_item_id: { in: items.map((item) => item.saleItemId) } },
      select: { sale_item_id: true, quantity: true },
    });
    const returned: Record<string, number> = {};
    for (const row of previous) {
      if (row.sale_item_id) {
        returned[row.sale_item_id] =
          (returned[row.sale_item_id] ?? 0) + (row.quantity ?? 0);
      }
    }
    let computedRefund = 0;
    for (const line of items) {
      const sold = saleItems.get(line.saleItemId);
      if (!sold) {
        throw new HttpException(
          { error: `Invalid sale line: ${line.saleItemId}` },
          400,
        );
      }
      const available =
        sold.quantity - (returned[line.saleItemId] ?? 0);
      if (line.quantity <= 0 || line.quantity > available) {
        throw new HttpException(
          {
            error: `Invalid quantity for ${sold.medication_name}. Max returnable: ${available}`,
          },
          400,
        );
      }
      const disposition =
        line.disposition ?? defaultDispositionForReason(reason);
      if (!isDispositionAllowed(reason, disposition)) {
        throw new HttpException(
          {
            error: `Cannot restock ${sold.medication_name} for reason "${reason}". Use damaged or destroy.`,
          },
          400,
        );
      }
      if (
        sold.inventory_id &&
        line.inventoryId !== sold.inventory_id
      ) {
        throw new HttpException(
          { error: `Inventory mismatch for ${sold.medication_name}` },
          400,
        );
      }
      computedRefund += line.quantity * Number(sold.unit_price);
    }
    const finalRefund = refundAmount > 0 ? refundAmount : computedRefund;
    const returnRecord = await this.prisma.$transaction(async (tx) => {
      const record = await tx.returns.create({
        data: {
          pharmacy_id: pharmacyId,
          branch_id: branchId,
          sale_id: saleId,
          reason,
          return_type: this.returnType(returnType),
          notes,
          refund_amount: finalRefund,
          refund_method: refundMethod,
          status: "processed",
          processed_by: userId,
        },
      });
      for (const line of items) {
        const sold = saleItems.get(line.saleItemId)!;
        const disposition =
          line.disposition ?? defaultDispositionForReason(reason);
        await tx.return_items.create({
          data: {
            return_id: record.id,
            sale_item_id: line.saleItemId,
            inventory_id: sold.inventory_id,
            medication_name: sold.medication_name,
            quantity: line.quantity,
            unit_price: sold.unit_price,
            total_price: line.quantity * Number(sold.unit_price),
            disposition: disposition as return_disposition,
            batch_number: sold.batch_number,
            expiry_date: sold.expiry_date,
          },
        });
        if (!sold.inventory_id) continue;
        const movementType =
          stockMovementTypeForDisposition(disposition);
        if (disposition === "restock") {
          const inventory = await tx.inventory.findUnique({
            where: { id: sold.inventory_id },
          });
          if (
            inventory?.pharmacy_id === pharmacyId &&
            inventory.branch_id === branchId
          ) {
            await tx.inventory.update({
              where: { id: sold.inventory_id },
              data: {
                quantity_in_stock:
                  (inventory.quantity_in_stock ?? 0) + line.quantity,
              },
            });
          }
        }
        await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            inventory_id: sold.inventory_id,
            movement_type: movementType,
            quantity: line.quantity,
            reference_id: record.id,
            reference_type: "return",
            notes: `Return ${record.id} · ${reason} · ${disposition}${
              disposition === "restock" ? "" : " (not restocked)"
            }`,
            created_by: userId,
          },
        });
      }
      await tx.cashier_shifts.update({
        where: { id: openShift.id },
        data: {
          total_refunds:
            Number(openShift.total_refunds ?? 0) + finalRefund,
        },
      });
      return record;
    });
    return {
      success: true,
      return: returnRecord,
      refundAmount: finalRefund,
    };
  }

  async voidSale(
    userId: string,
    body: Record<string, unknown>,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const saleId =
      typeof body.saleId === "string" ? body.saleId : undefined;
    if (!saleId) {
      throw new HttpException({ error: "saleId is required" }, 400);
    }
    const reason =
      typeof body.reason === "string" ? body.reason : "User requested";
    const { pharmacyId } = await this.pos.requireFeature(
      userId,
      "pos.void",
    );
    const voided = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sales.findFirst({
        where: { id: saleId, pharmacy_id: pharmacyId, status: "completed" },
        include: {
          sale_items: true,
          returns: { select: { id: true }, take: 1 },
        },
      });
      if (!sale) return null;
      if (sale.returns.length) {
        throw new HttpException(
          { error: "Cannot void a sale that has returns" },
          409,
        );
      }
      const voidNote = `Voided: ${reason}`;
      await tx.sales.update({
        where: { id: sale.id },
        data: {
          status: "cancelled",
          notes: [sale.notes, voidNote].filter(Boolean).join(" · "),
          updated_at: new Date(),
        },
      });
      for (const item of sale.sale_items) {
        if (!item.inventory_id) continue;
        const inventory = await tx.inventory.findUnique({
          where: { id: item.inventory_id },
        });
        await tx.inventory.update({
          where: { id: item.inventory_id },
          data: {
            quantity_in_stock:
              (inventory?.quantity_in_stock ?? 0) + item.quantity,
          },
        });
        await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            inventory_id: item.inventory_id,
            movement_type: "in",
            quantity: item.quantity,
            reference_id: sale.id,
            reference_type: "sale_void",
            notes: voidNote,
            created_by: userId,
          },
        });
      }
      if (sale.shift_id) {
        const shift = await tx.cashier_shifts.findUnique({
          where: { id: sale.shift_id },
        });
        if (shift) {
          await tx.cashier_shifts.update({
            where: { id: sale.shift_id },
            data: {
              total_sales: Math.max(
                0,
                Number(shift.total_sales ?? 0) -
                  Number(sale.total_amount ?? 0),
              ),
              transaction_count: Math.max(
                0,
                (shift.transaction_count ?? 0) - 1,
              ),
            },
          });
        }
      }
      return sale;
    });
    if (!voided) {
      throw new HttpException(
        { error: "Sale not found or already voided" },
        404,
      );
    }
    await this.audit.writeAuditLog({
      pharmacyId,
      userId,
      action: "UPDATE",
      tableName: "sales",
      recordId: saleId,
      newValues: { status: "cancelled", reason },
      ...metadata,
    });
    return {
      success: true,
      voidedSale: {
        id: saleId,
        voidedAt: new Date().toISOString(),
        reason: body.reason,
        status: "cancelled",
      },
    };
  }
}
