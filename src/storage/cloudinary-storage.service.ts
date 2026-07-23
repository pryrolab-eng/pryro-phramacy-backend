import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
import {
  StorageService,
  type SaveInput,
  type UploadCategory,
} from "./storage.service";

/**
 * Cloudinary-backed storage service.
 * Used when CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and
 * CLOUDINARY_API_SECRET are all set in the environment.
 */
@Injectable()
export class CloudinaryStorageService extends StorageService {
  private readonly logger = new Logger(CloudinaryStorageService.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.cloudName = config.get("CLOUDINARY_CLOUD_NAME") ?? "";
    this.apiKey = config.get("CLOUDINARY_API_KEY") ?? "";
    this.apiSecret = config.get("CLOUDINARY_API_SECRET") ?? "";
  }

  static isConfigured(config: ConfigService): boolean {
    return Boolean(
      config.get("CLOUDINARY_CLOUD_NAME") &&
        config.get("CLOUDINARY_API_KEY") &&
        config.get("CLOUDINARY_API_SECRET"),
    );
  }

  isReady(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  private async getCloudinary() {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
    return cloudinary;
  }

  /** Convert category + path to a Cloudinary public_id */
  private toPublicId(category: UploadCategory, objectPath: string): string {
    const normalized = objectPath.replace(/\\/g, "/").replace(/^\/+/, "");
    // Strip extension — Cloudinary handles it
    const withoutExt = normalized.replace(/\.[^/.]+$/, "");
    return `pryrox/${category}/${withoutExt}`;
  }

  async save(input: SaveInput): Promise<void> {
    const cloudinary = await this.getCloudinary();
    const publicId = this.toPublicId(input.category, input.objectPath);
    const mimeType = this.getMimeType(input.objectPath.split("/").pop() ?? "");
    const base64 = `data:${mimeType};base64,${input.buffer.toString("base64")}`;

    const isImage = mimeType.startsWith("image/");

    await cloudinary.uploader.upload(base64, {
      public_id: publicId,
      resource_type: isImage ? "image" : "raw",
      overwrite: true,
      invalidate: true,
      ...(isImage
        ? {
            transformation: [
              { width: 1200, height: 1200, crop: "limit" },
              { fetch_format: "auto", quality: "auto" },
            ],
          }
        : {}),
    });
  }

  /**
   * Upload a pharmacy logo with specific transformations.
   * Returns the CDN URL directly.
   */
  async uploadLogo(
    buffer: Buffer,
    pharmacyId: string,
    mimeType: string,
  ): Promise<string> {
    const cloudinary = await this.getCloudinary();
    const base64 = `data:${mimeType};base64,${buffer.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: `pryrox/pharmacies/${pharmacyId}`,
      public_id: "logo",
      resource_type: "image",
      overwrite: true,
      invalidate: true,
      transformation: [
        { width: 512, height: 512, crop: "limit" },
        { fetch_format: "auto", quality: "auto" },
      ],
    });

    if (!result.secure_url) {
      throw new Error("Cloudinary upload did not return a URL");
    }
    return result.secure_url;
  }

  async read(_category: UploadCategory, _objectPath: string): Promise<Buffer> {
    throw new Error("Cloudinary does not support server-side read — use the CDN URL directly");
  }

  async delete(category: UploadCategory, objectPath: string): Promise<void> {
    const cloudinary = await this.getCloudinary();
    const publicId = this.toPublicId(category, objectPath);
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      this.logger.warn(`Cloudinary delete failed for ${publicId}: ${err}`);
    }
  }

  getUrl(category: UploadCategory, objectPath: string): string {
    const publicId = this.toPublicId(category, objectPath);
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${publicId}`;
  }
}
