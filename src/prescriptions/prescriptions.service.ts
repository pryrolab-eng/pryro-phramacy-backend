import { Injectable } from "@nestjs/common";
import type {
  prescription_priority,
  prescription_status,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeMedications(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return [];
  }

  private parsePriority(value: unknown): prescription_priority {
    const allowed = new Set(["low", "medium", "high", "urgent"]);
    return typeof value === "string" && allowed.has(value)
      ? (value as prescription_priority)
      : "medium";
  }

  private parseStatus(value: unknown): prescription_status | undefined {
    const allowed = new Set(["pending", "dispensed", "completed", "cancelled"]);
    return typeof value === "string" && allowed.has(value)
      ? (value as prescription_status)
      : undefined;
  }

  async list(pharmacyId: string) {
    const rows = await this.prisma.prescriptions.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      patient: row.patient_name,
      doctor: row.doctor_name,
      medications: row.medications,
      priority: row.priority ?? "medium",
      status: row.status ?? "pending",
      time: row.created_at ? new Date(row.created_at).toLocaleTimeString() : "",
      insurance: row.insurance_provider || "None",
      created_at: row.created_at?.toISOString() ?? null,
    }));
  }

  create(
    pharmacyId: string,
    input: {
      patientName: string;
      doctorName: string;
      medications: unknown;
      priority?: unknown;
      insuranceProvider?: string | null;
      notes?: string | null;
    },
  ) {
    return this.prisma.prescriptions.create({
      data: {
        pharmacy_id: pharmacyId,
        patient_name: input.patientName,
        doctor_name: input.doctorName,
        medications: this.normalizeMedications(input.medications),
        priority: this.parsePriority(input.priority),
        status: "pending",
        insurance_provider: input.insuranceProvider ?? "None",
        notes: input.notes ?? null,
      },
    });
  }

  exists(pharmacyId: string, id: string) {
    return this.prisma.prescriptions.findFirst({
      where: { id, pharmacy_id: pharmacyId },
      select: { id: true },
    });
  }

  async update(
    pharmacyId: string,
    id: string,
    input: {
      patientName?: string;
      doctorName?: string;
      medications?: unknown;
      priority?: unknown;
      status?: unknown;
      insuranceProvider?: string | null;
      notes?: string | null;
    },
  ) {
    const status = this.parseStatus(input.status);
    const result = await this.prisma.prescriptions.updateMany({
      where: { id, pharmacy_id: pharmacyId },
      data: {
        ...(input.patientName !== undefined
          ? { patient_name: input.patientName }
          : {}),
        ...(input.doctorName !== undefined
          ? { doctor_name: input.doctorName }
          : {}),
        ...(input.medications !== undefined
          ? { medications: this.normalizeMedications(input.medications) }
          : {}),
        ...(input.priority !== undefined
          ? { priority: this.parsePriority(input.priority) }
          : {}),
        ...(status !== undefined ? { status } : {}),
        ...(input.insuranceProvider !== undefined
          ? { insurance_provider: input.insuranceProvider }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.prisma.prescriptions.findFirst({
      where: { id, pharmacy_id: pharmacyId },
    });
  }

  async delete(pharmacyId: string, id: string): Promise<boolean> {
    const result = await this.prisma.prescriptions.deleteMany({
      where: { id, pharmacy_id: pharmacyId },
    });
    return result.count > 0;
  }
}
