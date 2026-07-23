import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { UploadsController } from "./uploads.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [FilesController, UploadsController],
})
export class FilesModule {}
