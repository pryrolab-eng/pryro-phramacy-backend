import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StaffInviteService } from "../staff/staff-invite.service";
import {
  EMPTY_PHARMACIST_STATS,
  type PharmacistActivity,
  type PharmacistChartPoint,
  type PharmacistStats,
  type PendingPrescription,
} from "./models";

function decimal(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

@Injectable()
export class PharmacistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffInvite: StaffInviteService,
  ) {}

  async dashboardStats(pharmacyId: string): Promise<PharmacistStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [prescriptionsToday, completedSales, pendingPrescriptions, alertsHandled] =
      await Promise.all([
        this.prisma.prescriptions.count({
          where: {
            pharmacy_id: pharmacyId,
            created_at: { gte: today, lt: tomorrow },
          },
        }),
        this.prisma.sales.count({
          where: {
            pharmacy_id: pharmacyId,
            status: "completed",
            created_at: { gte: today, lt: tomorrow },
          },
        }),
        this.prisma.prescriptions.count({
          where: { pharmacy_id: pharmacyId, status: "pending" },
        }),
        this.prisma.alerts.count({
          where: {
            pharmacy_id: pharmacyId,
            is_resolved: true,
            resolved_at: { gte: today, lt: tomorrow },
          },
        }),
      ]);

    return {
      prescriptionsToday,
      customersServed: completedSales,
      averageWaitTime: 8,
      completedSales,
      pendingPrescriptions,
      consultationsGiven: Math.floor(completedSales * 0.4),
      inventoryChecks: 0,
      alertsHandled,
    };
  }

  async pendingPrescriptions(pharmacyId: string): Promise<PendingPrescription[]> {
    const prescriptions = await this.prisma.prescriptions.findMany({
      where: { pharmacy_id: pharmacyId, status: "pending" },
      orderBy: [{ priority: "desc" }, { created_at: "asc" }],
    });

    return prescriptions.map((p) => ({
      id: p.id,
      patient: p.patient_name,
      doctor: p.doctor_name,
      medications: p.medications,
      priority: p.priority ?? "low",
      time: p.created_at ? new Date(p.created_at).toLocaleTimeString() : "",
      insurance: p.insurance_provider || "None",
    }));
  }

  async processPrescription(
    prescriptionId: string,
    action: string,
    pharmacyId: string,
  ): Promise<boolean> {
    const prescription = await this.prisma.prescriptions.findFirst({
      where: { id: prescriptionId, pharmacy_id: pharmacyId },
      select: { id: true },
    });
    if (!prescription) return false;

    if (action === "dispense") {
      await this.prisma.prescriptions.update({
        where: { id: prescriptionId },
        data: { status: "dispensed" },
      });
    }
    return true;
  }

  async chartData(pharmacyId: string): Promise<PharmacistChartPoint[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [sales, prescriptions] = await Promise.all([
      this.prisma.sales.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: today, lt: tomorrow },
        },
        select: { created_at: true },
      }),
      this.prisma.prescriptions.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: today, lt: tomorrow },
        },
        select: { created_at: true },
      }),
    ]);

    const chartData: PharmacistChartPoint[] = [];
    for (let hour = 9; hour <= 17; hour++) {
      const hourStr = `${hour}:00`;
      const salesCount = sales.filter(
        (s) => s.created_at && new Date(s.created_at).getHours() === hour,
      ).length;
      const prescCount = prescriptions.filter(
        (p) => p.created_at && new Date(p.created_at).getHours() === hour,
      ).length;
      chartData.push({ time: hourStr, prescriptions: prescCount, customers: salesCount });
    }
    return chartData;
  }

  async recentActivities(pharmacyId: string): Promise<PharmacistActivity[]> {
    const sales = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId },
      select: { id: true, customer_name: true, total_amount: true, created_at: true },
      orderBy: { created_at: "desc" },
      take: 4,
    });

    return sales.map((sale) => ({
      id: sale.id,
      type: "sale",
      description: `Sale to ${sale.customer_name || "Walk-in Customer"} - ${Math.round(decimal(sale.total_amount))} RWF`,
      time: sale.created_at ? new Date(sale.created_at).toLocaleTimeString() : "",
      status: "completed",
    }));
  }

  async inviteStaff(input: {
    pharmacyId: string;
    pharmacyName: string;
    email: string;
    fullName: string;
    phone?: string;
    role?: string;
    password?: string;
    invitedByUserId: string;
  }) {
    return this.staffInvite.invitePharmacyStaffMember(input);
  }
}
