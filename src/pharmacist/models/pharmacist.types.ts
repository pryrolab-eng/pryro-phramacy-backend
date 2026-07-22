export const EMPTY_PHARMACIST_STATS = {
  prescriptionsToday: 0,
  customersServed: 0,
  averageWaitTime: 8,
  completedSales: 0,
  pendingPrescriptions: 0,
  consultationsGiven: 0,
  inventoryChecks: 0,
  alertsHandled: 0,
};

export type PharmacistStats = typeof EMPTY_PHARMACIST_STATS;

export type PharmacistActivity = {
  id: string;
  type: string;
  description: string;
  time: string;
  status: string;
};

export type PharmacistChartPoint = {
  time: string;
  prescriptions: number;
  customers: number;
};

export type PendingPrescription = {
  id: string;
  patient: string;
  doctor: string;
  medications: string[];
  priority: string;
  time: string;
  insurance: string;
};
