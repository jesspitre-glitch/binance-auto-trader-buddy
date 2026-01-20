import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  id?: string;
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  fallback?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

const safeParseDecimal = (raw: string, fallback: number): number => {
  const normalized = raw.replace(",", ".").trim();

  // transient states while typing
  if (
    normalized === "" ||
    normalized === "-" ||
    normalized === "." ||
    normalized === "-."
  ) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Decimal input that supports Danish/EU comma decimals.
 * Keeps free-form text while focused and commits a numeric value on blur.
 */
export function DecimalInput({
  id,
  value,
  onValueChange,
  fallback = 0,
  disabled,
  className,
  placeholder,
  min,
  max,
}: Props) {
  const [text, setText] = useState<string>(String(value ?? fallback));
  const [focused, setFocused] = useState(false);
  const valueRef = useRef<number | null | undefined>(value);

  useEffect(() => {
    if (!focused && value !== valueRef.current) {
      valueRef.current = value;
      setText(String(value ?? fallback));
    }
  }, [value, focused, fallback]);

  const handleChange = (raw: string) => {
    // Allow partial values while typing: "", "0,", "0.", "-" ...
    const isAllowed = /^-?\d*(?:[.,]\d*)?$/.test(raw);
    if (!isAllowed) return;
    setText(raw);
  };

  const commit = () => {
    let finalValue = safeParseDecimal(text, fallback);
    
    // Apply min/max constraints
    if (min !== undefined && finalValue < min) finalValue = min;
    if (max !== undefined && finalValue > max) finalValue = max;
    
    valueRef.current = finalValue;
    onValueChange(finalValue);
    setText(String(finalValue));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        // Select all so user can easily overwrite
        e.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      disabled={disabled}
      className={className}
    />
  );
}
