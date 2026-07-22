import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(pharmacyId: string, pattern: string) {
    const [customers, products, prescriptions, sales, staff, branches] =
      await Promise.all([
        this.prisma.customers.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { name: { contains: pattern, mode: "insensitive" } },
              { phone: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, phone: true },
          take: 6,
        }),
        this.prisma.medications.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { name: { contains: pattern, mode: "insensitive" } },
              { generic_name: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, category: true, generic_name: true },
          take: 6,
        }),
        this.prisma.prescriptions.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { patient_name: { contains: pattern, mode: "insensitive" } },
              { doctor_name: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: { id: true, patient_name: true, doctor_name: true, status: true },
          take: 6,
        }),
        this.prisma.sales.findMany({
          where: {
            pharmacy_id: pharmacyId,
            status: "completed",
            OR: [
              { receipt_number: { contains: pattern, mode: "insensitive" } },
              { customer_name: { contains: pattern, mode: "insensitive" } },
              { customer_phone: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            receipt_number: true,
            customer_name: true,
            total_amount: true,
          },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
        this.prisma.staff.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { first_name: { contains: pattern, mode: "insensitive" } },
              { last_name: { contains: pattern, mode: "insensitive" } },
              { email: { contains: pattern, mode: "insensitive" } },
              { position: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            position: true,
          },
          take: 6,
        }),
        this.prisma.branches.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { name: { contains: pattern, mode: "insensitive" } },
              { address: { contains: pattern, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, address: true, is_active: true },
          take: 6,
        }),
      ]);
    const inventory = await this.prisma.inventory.findMany({
      where: { pharmacy_id: pharmacyId, medication_id: { in: products.map((p) => p.id) } },
      select: { id: true, medication_id: true },
      take: 50,
    });
    const inventoryByMedication = new Map<string, string>();
    for (const row of inventory) {
      if (row.medication_id && !inventoryByMedication.has(row.medication_id)) {
        inventoryByMedication.set(row.medication_id, row.id);
      }
    }
    return {
      customers,
      products: products.map((item) => ({
        id: inventoryByMedication.get(item.id) ?? item.id,
        medicationId: item.id,
        name: item.name,
        category: item.category ?? item.generic_name,
      })),
      prescriptions: prescriptions.map((item) => ({
        id: item.id,
        patient: item.patient_name,
        doctor: item.doctor_name,
        status: item.status,
      })),
      sales: sales.map((item) => ({
        id: item.id,
        receiptNumber: item.receipt_number ?? "",
        customerName: item.customer_name ?? "",
        totalAmount: Number(item.total_amount ?? 0),
      })),
      staff: staff.map((item) => ({
        id: item.id,
        name: [item.first_name, item.last_name].filter(Boolean).join(" "),
        email: item.email,
        role: item.position,
      })),
      branches: branches.map((item) => ({
        id: item.id,
        name: item.name,
        city: item.address,
        status: item.is_active ? "active" : "inactive",
      })),
    };
  }
}
