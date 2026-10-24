import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMerchant } from "@/context/MerchantContext";

export const MerchantPicker = () => {
  const { merchants, merchant, setSelectedId } = useMerchant();
  if (!merchants.length) return null;
  return (
    <Select value={merchant?.id || ""} onValueChange={setSelectedId}>
      <SelectTrigger
        data-testid="merchant-switcher-select"
        className="h-8 w-[160px] rounded-full border-white/10 bg-white/[0.03] text-xs text-zinc-200 sm:w-[230px]"
      >
        <span className="mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
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
