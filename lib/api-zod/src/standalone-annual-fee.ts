type QuoteRow = { id: number; amount: number; status: string; paymentType?: string | null; installmentNumber?: number | null; annualFeeTotal?: number | null };
const annualTypes = new Set(['annual_fee', 'annual_fee_installment']);
export const standaloneQuoteRows = <T extends QuoteRow>(rows: T[]) => rows.filter(row => annualTypes.has(row.paymentType ?? '') || row.paymentType === 'registration_fee' || row.paymentType?.startsWith('player_total_'));
export function standaloneAnnualBalance(rows: QuoteRow[], total: number) {
  const quotes = standaloneQuoteRows(rows);
  if (quotes.some(row => !Number.isFinite(row.amount) || row.amount < 0)) throw new Error('Sono presenti importi non validi: verifica il piano quote.');
  if (quotes.some(row => row.paymentType?.startsWith('player_total_') || (annualTypes.has(row.paymentType ?? '') && row.installmentNumber != null)))
    throw new Error('È presente un piano rateale: aggiorna il piano quote nella scheda giocatore.');
  const annual = quotes.filter(row => annualTypes.has(row.paymentType ?? ''));
  const pending = annual.filter(row => row.status !== 'paid');
  if (pending.length > 1) throw new Error('Più quote annuali aperte: verifica il piano quote nella scheda giocatore.');
  const cents = Math.round(total * 100);
  if (!Number.isFinite(total) || cents < 1 || cents > 100000000) throw new Error('Indica un totale annuale valido.');
  const allocated = quotes.filter(row => row.paymentType === 'registration_fee' || row.status === 'paid')
    .reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  if (allocated > cents) throw new Error('Il totale annuale è inferiore alle quote già registrate. Verifica gli incassi senza cancellarli.');
  if (allocated === cents && pending.length) throw new Error('La quota è già coperta: verifica la voce aperta nel piano quote prima di eliminarla.');
  return { residual: (cents - allocated) / 100, allocated: allocated / 100, pendingId: pending[0]?.id };
}
export function registrationAnnualAdjustment(rows: QuoteRow[], amount: number) {
  const annual = standaloneQuoteRows(rows).filter(row => row.paymentType !== 'registration_fee');
  if (!annual.length) return undefined;
  if (annual.length !== 1 || !annual[0].annualFeeTotal)
    throw new Error('Conferma prima il totale annuale con Correggi totale annuale, oppure usa il piano quote.');
  return standaloneAnnualBalance([...rows,{id:-1,amount,status:'pending',paymentType:'registration_fee'}],annual[0].annualFeeTotal);
}
