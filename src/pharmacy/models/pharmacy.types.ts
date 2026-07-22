export const DEFAULT_PHARMACY_BRANDING = {
  platformName: "",
  logoUrl: "",
  primaryColor: "#171717",
  customDomain: "",
};

export const DEFAULT_INVOICE_TEMPLATE = {
  showLogo: true,
  headerFields: ["pharmacyName", "pharmacyAddress", "pharmacyPhone", "date"],
  patientFields: [
    "beneficialNumber",
    "beneficialName",
    "telephone",
    "insuranceTIN",
  ],
  productFields: ["name", "batch", "expiryDate", "quantity", "price", "total"],
  showTax: true,
  showInsuranceSplit: true,
  footerText: "Thank you for your business",
};

export type PharmacyBranding = typeof DEFAULT_PHARMACY_BRANDING;
export type InvoiceTemplateConfig = typeof DEFAULT_INVOICE_TEMPLATE;

export type MedicationProviderCoverage = {
  covered?: boolean;
  externalCode?: string;
  notes?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
};

export type MedicationInsuranceCoverageMap = Record<
  string,
  MedicationProviderCoverage
>;

export type AuditLogFilters = {
  action?: string;
  table?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
};

export const EMPTY_DASHBOARD = {
  stats: {
    totalProducts: 0,
    lowStockItems: 0,
    todaySales: 0,
    monthlyRevenue: 0,
    totalCustomers: 0,
    activeStaff: 0,
    pendingOrders: 0,
    expiringProducts: 0,
  },
  recentSales: [],
  stockAlerts: { all: [], lowStock: [], expiring: [] },
  salesChart: [],
  weeklySales: [],
  categorySales: [],
  inventoryChart: [],
};

export const DEMO_INVENTORY_PRODUCTS = [
  ["Paracetamol 500mg", "Pain Relief", 240, 40, 500, "2026-12-31", "DEMO-PAR-001"],
  ["Amoxicillin 250mg", "Antibiotics", 120, 25, 1200, "2026-08-30", "DEMO-AMX-001"],
  ["Ibuprofen 400mg", "Pain Relief", 180, 30, 800, "2026-10-15", "DEMO-IBU-001"],
  ["Metformin 500mg", "Prescription", 90, 20, 1500, "2027-01-20", "DEMO-MET-001"],
  ["Cetirizine 10mg", "OTC", 150, 25, 600, "2026-11-30", "DEMO-CET-001"],
  ["ORS Sachets", "OTC", 200, 50, 300, "2027-03-01", "DEMO-ORS-001"],
  ["Vitamin C 1000mg", "Vitamins", 75, 15, 2000, "2026-09-01", "DEMO-VIT-001"],
  ["Azithromycin 500mg", "Antibiotics", 60, 15, 3500, "2026-07-31", "DEMO-AZI-001"],
] as const;

export const DEMO_CUSTOMERS = [
  ["Jean Mukamana", "+250788123456", "jean.demo@example.com", "1990-05-12", "Penicillin", "RSSB-DEMO-1001"],
  ["Paul Nkurunziza", "+250789654321", "paul.demo@example.com", "1985-11-03", "", "RSSB-DEMO-1002"],
  ["Alice Uwase", "+250788222333", "alice.demo@example.com", "1998-02-18", "", ""],
] as const;

export const DEMO_INSURANCE_PROVIDER = {
  name: "RSSB Demo",
  coveragePercentage: 80,
  contactEmail: "claims.demo@rssb.example",
  contactPhone: "+250788000111",
  policyNumber: "RSSB-DEMO-POLICY",
};
