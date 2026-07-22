import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_PHARMACY_BRANDING,
  type PharmacyBranding,
} from "./models";

export type UploadedLogoFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class PharmacyBrandingService {
  constructor(private readonly prisma: PrismaService) {}

  defaultBranding() {
    return { ...DEFAULT_PHARMACY_BRANDING };
  }

  async load(pharmacyId: string): Promise<PharmacyBranding | null> {
    const row = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: {
        platform_name: true,
        logo_url: true,
        primary_color: true,
        custom_domain: true,
      },
    });
    if (!row) return null;
    return {
      platformName: row.platform_name || "",
      logoUrl: row.logo_url || "",
      primaryColor: row.primary_color || "#171717",
      customDomain: row.custom_domain || "",
    };
  }

  async save(
    pharmacyId: string,
    body: Partial<PharmacyBranding>,
  ): Promise<void> {
    const data: {
      platform_name?: string | null;
      logo_url?: string | null;
      primary_color?: string;
      custom_domain?: string | null;
      updated_at?: Date;
    } = {};
    if (body.platformName !== undefined) {
      data.platform_name = body.platformName.trim() || null;
    }
    if (body.logoUrl !== undefined) data.logo_url = body.logoUrl || null;
    if (body.primaryColor) data.primary_color = body.primaryColor;
    if (body.customDomain !== undefined) {
      data.custom_domain = body.customDomain || null;
    }
    if (!Object.keys(data).length) return;
    await this.prisma.pharmacies.update({
      where: { id: pharmacyId },
      data: { ...data, updated_at: new Date() },
    });
  }

  private cloudinaryConfigured() {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET,
    );
  }

  private async uploadCloudinary(
    pharmacyId: string,
    file: UploadedLogoFile,
  ): Promise<string> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = process.env.CLOUDINARY_API_KEY!;
    const apiSecret = process.env.CLOUDINARY_API_SECRET!;
    const timestamp = Math.floor(Date.now() / 1000);
    const fields = {
      folder: `pryrox/pharmacies/${pharmacyId}`,
      invalidate: "true",
      overwrite: "true",
      public_id: "logo",
      timestamp: String(timestamp),
      transformation: "c_limit,h_512,w_512/f_auto,q_auto",
    };
    const signatureSource = Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const signature = createHash("sha1")
      .update(`${signatureSource}${apiSecret}`)
      .digest("hex");
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(file.buffer)], {
        type: file.mimetype || "image/png",
      }),
      file.originalname,
    );
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("api_key", apiKey);
    form.set("signature", signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: "POST", body: form },
    );
    const result = (await response.json()) as {
      secure_url?: string;
      error?: { message?: string };
    };
    if (!response.ok || !result.secure_url) {
      throw new Error(
        result.error?.message || "Cloudinary upload did not return a URL",
      );
    }
    return result.secure_url;
  }

  private async uploadLocal(
    pharmacyId: string,
    file: UploadedLogoFile,
  ): Promise<string> {
    const extension =
      path.extname(file.originalname).replace(/[^.a-z0-9]/gi, "") || ".png";
    const objectPath = `${pharmacyId}-${Date.now()}${extension}`;
    const cwd = process.cwd();
    const applicationRoot =
      path.basename(cwd).toLowerCase() === "backend" ? path.dirname(cwd) : cwd;
    const root = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(applicationRoot, "uploads");
    const directory = path.join(root, "pharmacy-logos");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, objectPath), file.buffer);
    const relative = `/api/files/pharmacy-logos/${encodeURIComponent(objectPath)}`;
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    return base ? `${base}${relative}` : relative;
  }

  async uploadLogo(
    pharmacyId: string,
    file: UploadedLogoFile,
  ): Promise<string> {
    const url = this.cloudinaryConfigured()
      ? await this.uploadCloudinary(pharmacyId, file)
      : await this.uploadLocal(pharmacyId, file);
    await this.save(pharmacyId, { logoUrl: url });
    return url;
  }
}
