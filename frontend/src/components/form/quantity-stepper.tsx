"use client";

import { cn } from "cn";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QuantityStepperProps = {
  id: string;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  max: number;
  min?: number;
  name?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onValueChange: (value: number) => void;
};

export function QuantityStepper({
  id,
  label,
  decreaseLabel,
  increaseLabel,
  value,
  max,
  min = 1,
  name,
  disabled = false,
  hideLabel = false,
  inputRef,
  onValueChange,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }

  const commit = (next: number) => {
    const clamped = Math.min(Math.max(Math.trunc(next), min), max);
    setDraft(String(clamped));
    if (clamped !== value) {
      onValueChange(clamped);
    }
  };

  const commitDraft = () => {
    const typed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(typed)) {
      setDraft(String(value));
      return;
    }
    commit(typed);
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={decreaseLabel}
          aria-controls={id}
          disabled={disabled || value <= min}
          onClick={() => commit(value - 1)}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Input
          id={id}
          ref={inputRef}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          className="w-16 text-center tabular-nums"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitDraft();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={increaseLabel}
          aria-controls={id}
          disabled={disabled || value >= max}
          onClick={() => commit(value + 1)}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
