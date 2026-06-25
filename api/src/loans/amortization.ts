export type Installment = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
};

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
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

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
