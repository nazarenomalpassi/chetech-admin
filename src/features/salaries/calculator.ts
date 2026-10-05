export type SalaryMemberInput = {
  id: string;
  name: string;
  targetAmount: number;
  paidAmount: number;
};

export type SalaryMemberAllocation = SalaryMemberInput & {
  targetSharePercentage: number;
  desiredCumulativeAmount: number;
  amountDueNow: number;
  salaryAmount: number;
  profitShareAmount: number;
  totalAmount: number;
  paidAfterPayment: number;
  remainingAfterPayment: number;
};

export type FundingAccountInput = {
  method: string;
  balance: number;
  amount: number;
};

function toCents(value: number) {
  return Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100));
}

function fromCents(value: number) {
  return value / 100;
}

function allocateCents(total: number, targets: number[]) {
  const targetTotal = targets.reduce((sum, target) => sum + target, 0);
  if (targetTotal === 0 || total === 0) return targets.map(() => 0);

  const allocations = targets.map((target, index) => {
    const numerator = total * target;
    return {
      index,
      amount: Math.floor(numerator / targetTotal),
      remainder: numerator % targetTotal
    };
  });
  let remaining = total - allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const byRemainder = [...allocations].sort(
    (left, right) =>
      (left.remainder === right.remainder ? left.index - right.index : left.remainder > right.remainder ? -1 : 1)
  );

  for (let index = 0; remaining > 0; index += 1) {
    byRemainder[index % byRemainder.length].amount += 1;
    remaining -= 1;
  }

  return allocations.sort((left, right) => left.index - right.index).map((allocation) => allocation.amount);
}

export function calculateSalaryPlan(members: SalaryMemberInput[], intendedTotal: number) {
  const targetCents = members.map((member) => toCents(member.targetAmount));
  const paidCents = members.map((member, index) => Math.min(toCents(member.paidAmount), targetCents[index]));
  const remainingCents = targetCents.map((target, index) => Math.max(target - paidCents[index], 0));
  const salaryMassCents = targetCents.reduce((sum, amount) => sum + amount, 0);
  const paidSalaryCents = paidCents.reduce((sum, amount) => sum + amount, 0);
  const remainingSalaryCents = remainingCents.reduce((sum, amount) => sum + amount, 0);
  const intendedCents = toCents(intendedTotal);
  const salaryBatchCents = Math.min(intendedCents, remainingSalaryCents);
  const profitShareCents = Math.max(intendedCents - salaryBatchCents, 0);
  const salaryAllocations = allocateCents(salaryBatchCents, remainingCents);
  const profitShareAllocations = allocateCents(profitShareCents, members.map(() => 1));

  const allocations: SalaryMemberAllocation[] = members.map((member, index) => {
    const salaryCents = salaryAllocations[index];
    const profitCents = profitShareAllocations[index];
    const paidAfterCents = paidCents[index] + salaryCents;
    const remainingCents = targetCents[index] > paidAfterCents ? targetCents[index] - paidAfterCents : 0;

    return {
      ...member,
      targetSharePercentage:
        salaryMassCents > 0 ? (targetCents[index] / salaryMassCents) * 100 : 0,
      desiredCumulativeAmount: fromCents(paidAfterCents),
      amountDueNow: fromCents(salaryCents),
      salaryAmount: fromCents(salaryCents),
      profitShareAmount: fromCents(profitCents),
      totalAmount: fromCents(salaryCents + profitCents),
      paidAfterPayment: fromCents(paidAfterCents),
      remainingAfterPayment: fromCents(remainingCents)
    };
  });

  return {
    salaryMass: fromCents(salaryMassCents),
    paidSalaryBefore: fromCents(paidSalaryCents),
    remainingSalaryBefore: fromCents(remainingSalaryCents),
    intendedTotal: fromCents(intendedCents),
    cappedSalaryTotal: fromCents(salaryBatchCents),
    salaryAmount: fromCents(salaryBatchCents),
    coveragePercentage: salaryMassCents > 0 ? ((paidSalaryCents + salaryBatchCents) / salaryMassCents) * 100 : 0,
    excessAmount: fromCents(profitShareCents),
    batchTotal: fromCents(intendedCents),
    members: allocations
  };
}

export function calculateFundingPlan(accounts: FundingAccountInput[], totalAmount: number) {
  const targetCents = toCents(totalAmount);
  let hasInvalidAmount = false;
  const rows = accounts.map((account) => {
    if (!Number.isFinite(account.amount) || account.amount < 0) hasInvalidAmount = true;
    const balanceCents = toCents(account.balance);
    const amountCents = toCents(account.amount);
    return {
      ...account,
      balance: fromCents(balanceCents),
      amount: fromCents(amountCents),
      isOverdrawn: amountCents > balanceCents
    };
  });
  const assignedCents = rows.reduce((sum, row) => sum + toCents(row.amount), 0);
  const differenceCents = targetCents - assignedCents;
  const hasOverdrawnAccount = rows.some((row) => row.isOverdrawn);

  return {
    rows,
    totalAmount: fromCents(targetCents),
    assignedAmount: fromCents(assignedCents),
    differenceAmount: fromCents(differenceCents),
    missingAmount: fromCents(Math.max(differenceCents, 0)),
    excessAssignedAmount: fromCents(Math.max(-differenceCents, 0)),
    hasInvalidAmount,
    hasOverdrawnAccount,
    isBalanced: differenceCents === 0 && !hasInvalidAmount && !hasOverdrawnAccount
  };
}
