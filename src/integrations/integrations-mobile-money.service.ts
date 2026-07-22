import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IntegrationsMobileMoneyService {
  constructor(private readonly prisma: PrismaService) {}

  async processPayment(input: { amount: number; phone: string; provider: string }) {
    const apiKey = await this.prisma.api_keys.findFirst({
      where: { pharmacy_id: null, is_active: true, name: "Mobile Money API" },
      select: { id: true },
    });

    if (!apiKey) {
      throw { status: 400, error: 'Mobile Money API credential not configured. Add a platform key named "Mobile Money API" in Admin → Settings → Integrations.' };
    }

    const txId = `momo_tx_${Math.random().toString(36).substring(2, 15)}`;
    const ref = `ref-${Math.random().toString(36).substring(2, 11)}`;

    return {
      success: true,
      transactionId: txId,
      status: "completed",
      provider: input.provider,
      phone: input.phone,
      amount: input.amount,
      reference: ref,
      message: "Mobile money payment collected successfully via simulated provider adapter.",
    };
  }
}
