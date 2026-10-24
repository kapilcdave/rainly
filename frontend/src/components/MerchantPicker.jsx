import { Store } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMerchant } from "@/context/MerchantContext";

export const MerchantPicker = () => {
  const { merchants, merchant, setSelectedId } = useMerchant();
  if (!merchants.length) return null;
  return (
    <Select value={merchant?.id || ""} onValueChange={setSelectedId}>
      <SelectTrigger
        data-testid="merchant-switcher-select"
        className="h-9 w-[170px] rounded-full border-sky-200 bg-sky-50 text-xs font-semibold text-[#0e487c] sm:w-[240px] sm:text-sm"
      >
        <Store className="mr-1 h-4 w-4 shrink-0" />
        <SelectValue placeholder="Pick merchant" />
      </SelectTrigger>
      <SelectContent>
        {merchants.map((m) => (
          <SelectItem key={m.id} value={m.id} data-testid={`merchant-option-${m.id}`}>
            {m.name} · {m.city}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
