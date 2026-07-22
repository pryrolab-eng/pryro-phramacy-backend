import type { medication_category } from "@prisma/client";

export type InventoryRow = {
  id: string;
  pharmacy_id: string | null;
  branch_id: string | null;
  medication_id: string | null;
  stock_location_id: string | null;
  batch_number: string;
  quantity_in_stock: number | null;
  selling_price: number | null;
  minimum_stock_level: number | null;
  expiry_date: Date | null;
  unit_cost: number | null;
  medications: {
    name: string;
    category: string;
    pharmacy_id: string | null;
  } | null;
  stock_locations: { id: string; name: string } | null;
};

export const medicationSelect = {
  id: true,
  name: true,
  category: true,
  pharmacy_id: true,
  categories: { select: { name: true } },
  global_categories: { select: { name: true } },
} as const;

export function categoryName(row: {
  category: medication_category | null;
  categories: { name: string } | null;
  global_categories: { name: string } | null;
}) {
  if (row.global_categories?.name) return row.global_categories.name;
  if (row.categories?.name) return row.categories.name;
  switch (row.category) {
    case "prescription":
      return "Prescription";
    case "controlled":
      return "Controlled";
    case "supplement":
      return "Supplements";
    case "medical_device":
      return "Medical Device";
    default:
      return "OTC";
  }
}

export function categoryEnum(label: string): medication_category {
  const values: Record<string, medication_category> = {
    antibiotics: "prescription",
    vitamins: "supplement",
    supplements: "supplement",
    prescription: "prescription",
    "prescription medications": "prescription",
    controlled: "controlled",
    "medical device": "medical_device",
    "medical devices": "medical_device",
  };
  return values[label.trim().toLowerCase()] ?? "otc";
}

export function isMissingStockLocation(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "P2022" &&
    String((error as { meta?: { column?: unknown } }).meta?.column ?? "").includes(
      "stock_location_id",
    )
  );
}

export const INVENTORY_UUID_EXAMPLES = {
  inventory: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba",
  medication: "21f777ae-e1b4-4a66-b193-72d89f922f49",
  pharmacy: "37f5f20e-8d92-4d9c-b75e-f13e530bfa61",
  branch: "94e4fb51-76c9-45eb-8597-22f0898c72ec",
  destinationBranch: "f79e32e1-aa15-4495-9fc7-a77dcbf07e78",
  stockLocation: "8c2537f8-8773-4fe7-98c4-52d1836782fc",
  supplier: "ba2bf838-208b-49f6-a54d-f62da8a39fc1",
  transfer: "12f7980e-e36c-43dd-a8c4-a1702f364503",
} as const;
