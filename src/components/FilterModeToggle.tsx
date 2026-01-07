import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Zap } from "lucide-react";

interface FilterModeToggleProps {
  isHard: boolean;
  onChange: (isHard: boolean) => void;
  disabled?: boolean;
}

export const FilterModeToggle = ({ isHard, onChange, disabled }: FilterModeToggleProps) => {
  return (
    <Badge
      variant={isHard ? "destructive" : "secondary"}
      className={`cursor-pointer px-2.5 py-1 text-xs gap-1 select-none transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"
      } ${isHard ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}
      onClick={() => !disabled && onChange(!isHard)}
      title={isHard ? "Hard Filter: Blokerer trade hvis ikke opfyldt" : "Soft Condition: Bidrager til signal score"}
    >
      {isHard ? (
        <>
          <ShieldAlert className="h-3 w-3" />
          Hard
        </>
      ) : (
        <>
          <Zap className="h-3 w-3" />
          Soft
        </>
      )}
    </Badge>
  );
};
