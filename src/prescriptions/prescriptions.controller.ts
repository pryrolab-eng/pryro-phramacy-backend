import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  CreatePrescriptionDto,
  DeletePrescriptionResponseDto,
  PrescriptionDto,
  PrescriptionMutationResponseDto,
  UpdatePrescriptionDto,
} from "./dto";
import { PrescriptionsService } from "./prescriptions.service";

const prescriptionId = "be2ac216-c693-4283-931c-cf1a92192c6a";

@ApiTags("Prescriptions")
@ApiCookieAuth("pryrox_session")
@Controller("prescriptions")
export class PrescriptionsController {
  constructor(
    private readonly service: PrescriptionsService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "List prescriptions",
    description:
      "Returns prescriptions for the authenticated user's active pharmacy in the legacy dashboard shape.",
  })
  @ApiOkResponse({
    description: "Prescriptions were returned newest first.",
    type: PrescriptionDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Prescriptions could not be loaded.", type: ErrorResponseDto })
  async list(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.list(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch prescriptions";
      throw new HttpException(
        { error: message },
        message === "Pharmacy not found" ? 404 : 500,
      );
    }
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Create a prescription",
    description:
      "Creates a pending prescription for the session's active pharmacy and returns the stored database row.",
  })
  @ApiBody({ required: true, description: "Prescription details.", type: CreatePrescriptionDto })
  @ApiOkResponse({ description: "The prescription was created.", type: PrescriptionMutationResponseDto })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The prescription could not be created.", type: ErrorResponseDto })
  async create(@Req() request: Request, @Body() body: Record<string, unknown>) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException({ success: false, error: "Unauthorized" }, 401);
      }
      const prescription = await this.service.create(
        await this.tenant.requirePharmacyId(user.id),
        {
          patientName: body.patient as string,
          doctorName: body.doctor as string,
          medications: body.medications,
          priority: body.priority,
          insuranceProvider: (body.insurance as string | null | undefined) || "None",
          notes: body.notes as string | null | undefined,
        },
      );
      return { success: true, prescription };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to create prescription";
      throw new HttpException(
        { success: false, error: message },
        message === "Pharmacy not found" ? 404 : 500,
      );
    }
  }

  @Put(":id")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Update a prescription",
    description:
      "Updates a prescription only when it belongs to the authenticated user's active pharmacy.",
  })
  @ApiParam({ name: "id", description: "Prescription identifier.", example: prescriptionId, type: String, format: "uuid" })
  @ApiBody({ required: true, description: "Prescription fields to replace.", type: UpdatePrescriptionDto })
  @ApiOkResponse({ description: "The prescription was updated.", type: PrescriptionMutationResponseDto })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The prescription does not exist in this pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The prescription could not be updated.", type: ErrorResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (!(await this.service.exists(pharmacyId, id))) {
        throw new HttpException({ error: "Prescription not found" }, 404);
      }
      const prescription = await this.service.update(pharmacyId, id, {
        patientName: body.patient as string | undefined,
        doctorName: body.doctor as string | undefined,
        medications: body.medications,
        priority: body.priority,
        status: body.status,
        insuranceProvider: body.insurance as string | null | undefined,
        notes: body.notes as string | null | undefined,
      });
      if (!prescription) {
        throw new HttpException({ error: "Prescription not found" }, 404);
      }
      return { success: true, prescription };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to update prescription";
      throw new HttpException({ error: message }, 500);
    }
  }

  @Delete(":id")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Delete a prescription",
    description:
      "Deletes a prescription only when it belongs to the authenticated user's active pharmacy.",
  })
  @ApiParam({ name: "id", description: "Prescription identifier.", example: prescriptionId, type: String, format: "uuid" })
  @ApiOkResponse({ description: "The prescription was deleted.", type: DeletePrescriptionResponseDto })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The prescription does not exist in this pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The prescription could not be deleted.", type: ErrorResponseDto })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    try {
      const deleted = await this.service.delete(
        await this.tenant.requirePharmacyId(user.id),
        id,
      );
      if (!deleted) {
        throw new HttpException({ error: "Prescription not found" }, 404);
      }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to delete prescription";
      throw new HttpException({ error: message }, 500);
    }
  }
}
