import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  id?: string;
  value: string; // in 24h format "HH:MM"
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function TimeInput({
  id,
  value,
  onChange,
  className,
  disabled,
}: TimeInputProps) {
  const [hours, setHours] = useState<number>(0); // 0–23
  const [minutes, setMinutes] = useState<number>(0);
  const [isPM, setIsPM] = useState(false);

  useEffect(() => {
    const [h, m] = value.split(":").map(Number);
    const hValid = isNaN(h) ? 0 : h;
    const mValid = isNaN(m) ? 0 : m;
    setHours(hValid);
    setMinutes(mValid);
    setIsPM(hValid >= 12);
  }, [value]);

  const updateTime = (h: number, m: number, forcePM = isPM) => {
    let rawHours = h;
    let rawMinutes = m;

    // Clamp
    rawHours = ((rawHours % 24) + 24) % 24;
    rawMinutes = ((rawMinutes % 60) + 60) % 60;

    // Convert to 24h format if using 12h display
    let adjustedHours = rawHours;
    if (forcePM) {
      adjustedHours = (rawHours % 12) + 12;
    } else {
      adjustedHours = rawHours % 12;
    }

    setHours(adjustedHours);
    setMinutes(rawMinutes);
    setIsPM(forcePM);

    const hh = adjustedHours.toString().padStart(2, "0");
    const mm = rawMinutes.toString().padStart(2, "0");
    onChange(`${hh}:${mm}`);
  };

  const displayHour12 = () => {
    const h = hours % 12;
    return h === 0 ? "12" : h.toString().padStart(2, "0");
  };

  return (
    <div className={cn("flex items-center", className)}>
      <div className="grid grid-cols-3 gap-1 items-center">
        {/* Hour/Minute input and buttons */}
        <div className="flex flex-col items-center">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => updateTime(hours + 1, minutes)}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Input
            id={id}
            className="text-center w-20 h-9"
            value={`${displayHour12()}:${minutes.toString().padStart(2, "0")}`}
            disabled={disabled}
            onChange={(e) => {
              const [hStr, mStr] = e.target.value.split(":");
              const h = parseInt(hStr);
              const m = parseInt(mStr);
              if (!isNaN(h) && !isNaN(m)) {
                updateTime(h, m, isPM);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => updateTime(hours - 1, minutes)}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Minutes */}
        <div className="flex flex-col items-center ml-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => updateTime(hours, minutes + 5)}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <div className="h-9 flex items-center justify-center text-sm">
            <span className="text-muted-foreground">min</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => updateTime(hours, minutes - 5)}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {/* AM/PM toggle */}
        <div className="flex flex-col items-center ml-1">
          <div className="h-8" />
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-12 text-xs"
            disabled={disabled}
            onClick={() => updateTime(hours, minutes, !isPM)}
          >
            {isPM ? "PM" : "AM"}
          </Button>
          <div className="h-8" />
        </div>
      </div>
    </div>
  );
}
