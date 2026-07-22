import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CategoriesService } from "./categories.service";
import { CategoryDeleteResponseDto, CategoryDto, CategoryMutationResponseDto, CreateCategoryDto, UpdateCategoryDto } from "./dto";

@ApiTags("Categories")
@ApiCookieAuth("pryrox_session")
@Controller("categories")
@UseGuards(SessionGuard)
export class CategoriesController {
  constructor(
    private readonly service: CategoriesService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List medicine categories", description: "Returns the active global, platform, and pharmacy-specific categories visible to the authenticated user's active pharmacy." })
  @ApiResponse({ status: 200, description: "Categories were loaded successfully.", type: CategoryDto, isArray: true })
  @ApiResponse({ status: 400, description: "The user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Categories could not be loaded.", type: ErrorResponseDto })
  async list(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.list(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load categories";
      throw new HttpException({ error: message }, message.includes("Pharmacy not found") ? 400 : 500);
    }
  }

  @Post()
  @ApiOperation({ summary: "Create a medicine category", description: "Creates an active category for the authenticated user's active pharmacy. Legacy categoryName and categoryDescription aliases are also accepted." })
  @ApiBody({ required: true, description: "Category details.", type: CreateCategoryDto })
  @ApiResponse({ status: 201, description: "The category was created.", type: CategoryMutationResponseDto })
  @ApiResponse({ status: 400, description: "The category name is missing or no pharmacy is active.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The category could not be created.", type: ErrorResponseDto })
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const name = String(body.name || body.categoryName || "").trim();
      if (!name) {
        throw new HttpException({ success: false, error: "Category name is required" }, 400);
      }
      const category = await this.service.create(
        pharmacyId,
        name,
        String(body.description || body.categoryDescription || ""),
      );
      return {
        success: true,
        category: {
          id: category.id,
          name: category.name,
          description: category.description,
          is_active: category.is_active,
          pharmacy_id: category.pharmacy_id,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, error: "Failed to add category" }, 500);
    }
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a medicine category", description: "Updates a pharmacy-owned category in the authenticated user's active pharmacy." })
  @ApiParam({ name: "id", required: true, type: String, format: "uuid", description: "Identifier of the category to update.", example: "8a8d7f2c-3f04-4d8e-98ad-95f47921a3de" })
  @ApiBody({ required: true, description: "Category fields to update. Omitted fields are left unchanged except status, whose absence currently deactivates the category.", type: UpdateCategoryDto })
  @ApiResponse({ status: 200, description: "The category was updated.", type: CategoryMutationResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "No pharmacy-owned category matches the identifier.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The category could not be updated.", type: ErrorResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string; status?: string },
  ) {
    try {
      const category = await this.service.update(await this.tenant.requirePharmacyId(user.id), id, body);
      if (!category) {
        throw new HttpException({ success: false, error: "Category not found" }, 404);
      }
      return { success: true, category };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, error: "Failed to update category" }, 500);
    }
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a medicine category", description: "Permanently deletes a pharmacy-owned category from the authenticated user's active pharmacy." })
  @ApiParam({ name: "id", required: true, type: String, format: "uuid", description: "Identifier of the category to delete.", example: "8a8d7f2c-3f04-4d8e-98ad-95f47921a3de" })
  @ApiResponse({ status: 200, description: "The category was deleted.", type: CategoryDeleteResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "No pharmacy-owned category matches the identifier.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The category could not be deleted.", type: ErrorResponseDto })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    try {
      const result = await this.service.delete(await this.tenant.requirePharmacyId(user.id), id);
      if (!result.count) {
        throw new HttpException({ success: false, error: "Category not found" }, 404);
      }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, error: "Failed to delete category" }, 500);
    }
  }
}
