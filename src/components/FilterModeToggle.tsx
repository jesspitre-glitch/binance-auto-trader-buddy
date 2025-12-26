import { Button } from "@/components/ui/button";
import { ShieldAlert, Zap } from "lucide-react";

interface FilterModeToggleProps {
  isHard: boolean;
  onChange: (isHard: boolean) => void;
  disabled?: boolean;
}

export const FilterModeToggle = ({ isHard, onChange, disabled }: FilterModeToggleProps) => {
  return (
    <Button
      variant={isHard ? "destructive" : "secondary"}
      size="sm"
      onClick={() => onChange(!isHard)}
      disabled={disabled}
      className="h-7 px-2 text-xs gap-1"
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
    </Button>
  );
};
