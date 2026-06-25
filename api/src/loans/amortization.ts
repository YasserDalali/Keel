export type Installment = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
};

// clamping to last day of target month avoids Feb 29/30/31 bugs
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

export function generateInstallments(
  principal: number,
  interestRate: number,
  termMonths: number,
  startDate: Date
): Installment[] {
  const totalRepayment = principal * (1 + interestRate);
  const baseAmount = Math.round((totalRepayment / termMonths) * 100) / 100;

  const installments: Installment[] = [];
  let remaining = totalRepayment;

  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonthsClamped(startDate, i);

    const isLastInstallment = i === termMonths;
    const amountDue = isLastInstallment ? Math.round(remaining * 100) / 100 : baseAmount;
    remaining = Math.round((remaining - amountDue) * 100) / 100;

    installments.push({
      installmentNumber: i,
      dueDate: dueDate.toISOString().slice(0, 10),
      amountDue,
    });
  }

  return installments;
}
