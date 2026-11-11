import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { receiptMethods } from "@/lib/payment-summary";

export function ReceiptMethodSelect({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-sm">
      Metodo di incasso
      <ScrollableSelect aria-label="Metodo di incasso" className="w-full" value={value} onValueChange={onChange} disabled={disabled}>
        <option value="">Scegli il metodo</option>
        {Object.entries(receiptMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </ScrollableSelect>
    </label>
  );
}
