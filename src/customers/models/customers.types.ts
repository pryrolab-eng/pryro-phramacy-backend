/** Maximum number of rows accepted by a single bulk-import request. */
export const MAX_IMPORT_ROWS = 500;

/** Normalized customer row as read from the database. */
export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  allergies: string[];
  insurance_number: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

/** Raw customer row shape returned by Prisma before normalization. */
export type PrismaCustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: Date | null;
  allergies: string[];
  insurance_number: string | null;
  is_active: boolean | null;
  created_at: Date | null;
};

/** Per-row failure reported by the bulk customer import. */
export type ImportRowFailure = {
  rowNumber: number;
  label: string;
  error: string;
};
