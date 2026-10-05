export type SalaryAccount = {
  method: "efectivo" | "nx" | "mp";
  label: string;
  openingBalance: number;
  income: number;
  outcome: number;
  transferDelta: number;
  balance: number;
};

export type SalaryMember = {
  id: string;
  name: string;
  targetAmount: number;
  sortOrder: number;
  paidAmount: number;
  profitSharePaid: number;
};

export type SalaryLiquidationMember = {
  memberId: string;
  memberName: string;
  targetAmount: number;
  salaryAmount: number;
  profitShareAmount: number;
  totalAmount: number;
  coveragePercentage: number;
};

export type SalaryLiquidationFunding = {
  paymentMethod: "efectivo" | "nx" | "mp";
  amount: number;
};

export type SalaryLiquidation = {
  id: string;
  periodMonth: string;
  withdrawalDate: string;
  intendedTotal: number;
  salaryMassSnapshot: number;
  salaryAmount: number;
  profitShareAmount: number;
  totalAmount: number;
  coveragePercentage: number;
  notes: string;
  createdAt: string;
  members: SalaryLiquidationMember[];
  funding: SalaryLiquidationFunding[];
};

export type FinancialReserve = {
  id: string;
  code: string;
  name: string;
  amount: number;
  sortOrder: number;
};

export type SalaryWithdrawal = {
  id: string;
  withdrawalDate: string;
  amount: number;
  paymentMethod: string;
  notes: string;
  createdAt: string;
  withdrawalType: "salary" | "extraordinary";
  salaryPeriod: string | null;
  targetAmountSnapshot: number | null;
  coveragePercentage: number | null;
  memberId: string | null;
  memberName: string | null;
};

export type SalaryPlanningData = {
  migrationReady: boolean;
  periodMonth: string;
  monthKey: string;
  monthLabel: string;
  accounts: SalaryAccount[];
  totalAvailable: number;
  members: SalaryMember[];
  reserves: FinancialReserve[];
  merchandise: {
    quantitySold: number;
    revenue: number;
    historicalCost: number;
    currentReplacementCost: number;
    grossMargin: number;
  };
  suggestedSalaryAmount: number;
  liquidations: SalaryLiquidation[];
  withdrawals: SalaryWithdrawal[];
};
