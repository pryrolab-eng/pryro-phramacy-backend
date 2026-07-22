import { Injectable, HttpException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IntegrationsRraEbmService {
  constructor(private readonly prisma: PrismaService) {}

  async submitSale(input: {
    pharmacyId: string;
    saleId: string;
    receiptNumber: string;
    customerName?: string | null;
    paymentMethod?: string | null;
    subtotal: number;
    items: Array<{ name: string; quantity: number; unitPrice: number }>;
  }) {
    const credential = await this.prisma.api_keys.findFirst({
      where: { pharmacy_id: null, is_active: true, name: "RRA EBM API" },
      select: { key_hash: true },
    });

    if (!credential?.key_hash) {
      return {
        ok: false,
        mode: "disabled",
        error: 'RRA EBM API credential not configured. Add a platform key named "RRA EBM API" in Admin → Settings → Integrations.',
      };
    }

    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: input.pharmacyId },
      select: { rra_tin: true, name: true },
    });

    const result = await this.submitToVsdc(credential.key_hash, {
      pharmacyTin: pharmacy?.rra_tin,
      receiptNumber: input.receiptNumber,
      saleId: input.saleId,
      customerName: input.customerName,
      paymentMethod: input.paymentMethod,
      items: input.items,
      subtotal: input.subtotal,
    });

    if (result.ok && result.ebmNumber) {
      await this.prisma.sales.update({
        where: { id: input.saleId },
        data: { rra_invoice_number: result.ebmNumber },
      });
    }

    return result;
  }

  private async submitToVsdc(
    credentialValue: string,
    payload: {
      pharmacyTin?: string | null;
      receiptNumber: string;
      saleId: string;
      customerName?: string | null;
      paymentMethod?: string | null;
      items: Array<{ name: string; quantity: number; unitPrice: number }>;
      subtotal: number;
    },
  ): Promise<{ ok: boolean; mode: string; ebmNumber?: string; error?: string }> {
    const config = this.resolveVsdcConfig(credentialValue, payload.pharmacyTin);
    if (!config) {
      return { ok: false, mode: "disabled", error: "VSDC base URL missing. Configure in RRA EBM API credential or RRA_VSDC_BASE_URL env." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          tin: payload.pharmacyTin,
          receiptNumber: payload.receiptNumber,
          saleId: payload.saleId,
          customerName: payload.customerName,
          paymentMethod: payload.paymentMethod,
          items: payload.items,
          subtotal: payload.subtotal,
          invoiceType: "SALE",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { ok: false, mode: config.sandbox ? "sandbox" : "live", error: `VSDC responded ${response.status}: ${body.slice(0, 500)}` };
      }

      const data = await response.json();
      return {
        ok: true,
        mode: config.sandbox ? "sandbox" : "live",
        ebmNumber: data.invoiceNumber ?? data.ebmNumber ?? data.receiptNumber,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, mode: "live", error: "VSDC request timed out after 20s" };
      }
      return { ok: false, mode: "live", error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveVsdcConfig(credentialValue: string, tin?: string | null): { baseUrl: string; apiKey: string; sandbox: boolean } | null {
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(credentialValue);
    } catch {
      parsed = { apiKey: credentialValue };
    }

    const baseUrl = parsed.baseUrl || parsed.url || process.env.RRA_VSDC_BASE_URL || "";
    if (!baseUrl) return null;

    const apiKey = parsed.apiKey || parsed.key || process.env.RRA_VSDC_API_KEY || "";
    if (!apiKey) return null;

    const sandbox = parsed.sandbox === "true" || process.env.RRA_VSDC_SANDBOX === "true";

    return { baseUrl, apiKey, sandbox };
  }
}
