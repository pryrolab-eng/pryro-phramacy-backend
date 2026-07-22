import { Injectable } from "@nestjs/common";

export const UPLOAD_CATEGORIES = {
  pharmacyLogos: "pharmacy-logos",
  platformReports: "platform-reports",
  pharmacyFiles: "pharmacy-files",
} as const;

export type UploadCategory = (typeof UPLOAD_CATEGORIES)[keyof typeof UPLOAD_CATEGORIES];

export type SaveInput = {
  category: UploadCategory;
  objectPath: string;
  buffer: Buffer;
};

export type UploadedFileMeta = {
  id: string;
  filename: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

@Injectable()
export abstract class StorageService {
  abstract save(input: SaveInput): Promise<void>;
  abstract read(category: UploadCategory, objectPath: string): Promise<Buffer>;
  abstract delete(category: UploadCategory, objectPath: string): Promise<void>;
  abstract getUrl(category: UploadCategory, objectPath: string): string;

  getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    return ext ? MIME_BY_EXT[`.${ext}`] ?? "application/octet-stream" : "application/octet-stream";
  }
}
