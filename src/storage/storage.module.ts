import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LocalStorageService } from "./local-storage.service";
import { CloudinaryStorageService } from "./cloudinary-storage.service";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: (config: ConfigService) => {
        const cs = new CloudinaryStorageService(config as any);
        if (cs.isReady()) {
          return cs;
        }
        return new LocalStorageService(config as any);
      },
      inject: [ConfigService],
    },
    // Always provide CloudinaryStorageService directly for logo uploads
    CloudinaryStorageService,
  ],
  exports: [StorageService, CloudinaryStorageService],
})
export class StorageModule {}
