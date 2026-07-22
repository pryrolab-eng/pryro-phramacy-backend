import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_SUPPORT_EMAIL = "support@pryrox.com";
const CACHE_TTL_MS = 300_000; // 5 minutes

type BrandingResult = {
  platformName: string;
  platformLogoUrl: string | null;
  supportEmail: string;
};

@Injectable()
export class BrandingService {
  private cache: { value: BrandingResult; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getPublicBranding(): Promise<BrandingResult> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.value;
    }

    try {
      const settings = await this.prisma.system_settings.findMany({
        where: {
          pharmacy_id: null,
          setting_key: { in: ["platformName", "platformLogoUrl", "supportEmail"] },
        },
        select: { setting_key: true, setting_value: true },
      });

      const map: Record<string, string> = {};
      for (const s of settings) {
        map[s.setting_key] = String(s.setting_value ?? "");
      }

      const result: BrandingResult = {
        platformName: map["platformName"] || "Pryrox",
        platformLogoUrl: map["platformLogoUrl"] || null,
        supportEmail: this.normalizeSupportEmail(map["supportEmail"]),
      };

      this.cache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    } catch {
      return {
        platformName: "Pryrox",
        platformLogoUrl: null,
        supportEmail: DEFAULT_SUPPORT_EMAIL,
      };
    }
  }

  private normalizeSupportEmail(raw: string | undefined): string {
    if (!raw || !raw.trim()) return DEFAULT_SUPPORT_EMAIL;
    const trimmed = raw.trim();
    return trimmed.includes("@") ? trimmed : DEFAULT_SUPPORT_EMAIL;
  }
}
