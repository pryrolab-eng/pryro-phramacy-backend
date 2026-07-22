import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import fs from "fs/promises";
import path from "path";
import type { Env } from "../config/env.schema";
import { StorageService, type SaveInput, type UploadCategory, UPLOAD_CATEGORIES } from "./storage.service";

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly uploadDir: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.uploadDir = config.get("UPLOAD_DIR")
      ? path.resolve(config.get("UPLOAD_DIR")!)
      : path.join(process.cwd(), "uploads");
  }

  private resolvePath(category: UploadCategory, objectPath: string): string {
    const normalized = objectPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..")) {
      throw new Error("Invalid upload path");
    }
    const full = path.join(this.uploadDir, category, normalized);
    const rootWithSep = path.join(this.uploadDir, category) + path.sep;
    if (!full.startsWith(rootWithSep) && full !== path.join(this.uploadDir, category)) {
      throw new Error("Invalid upload path");
    }
    return full;
  }

  async save(input: SaveInput): Promise<void> {
    const fullPath = this.resolvePath(input.category, input.objectPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.buffer);
  }

  async read(category: UploadCategory, objectPath: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(category, objectPath));
  }

  async delete(category: UploadCategory, objectPath: string): Promise<void> {
    try {
      await fs.unlink(this.resolvePath(category, objectPath));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  getUrl(category: UploadCategory, objectPath: string): string {
    const segments = objectPath
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment));
    return `/api/files/${category}/${segments.join("/")}`;
  }
}
