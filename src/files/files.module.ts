import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { UploadsController } from "./uploads.controller";

@Module({
  controllers: [FilesController, UploadsController],
})
export class FilesModule {}
