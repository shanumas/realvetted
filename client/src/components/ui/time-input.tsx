import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function TimeInput({ id, value, onChange, className, disabled }: TimeInputProps) {
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);

  // Parse the input value on mount and when it changes externally
  useEffect(() => {
    try {
      const [h, m] = value.split(":").map(Number);
      setHours(isNaN(h) ? 0 : h);
      setMinutes(isNaN(m) ? 0 : m);
    } catch (error) {
      setHours(0);
      setMinutes(0);
    }
  }, [value]);

  // Generate the new time string and call the onChange handler
  const updateTime = (newHours: number, newMinutes: number) => {
    // Ensure hours are between 0-23
    const validHours = Math.max(0, Math.min(23, newHours));
    // Ensure minutes are between 0-59
    const validMinutes = Math.max(0, Math.min(59, newMinutes));
    
    // Format as HH:MM (still using 24-hour format for internal storage)
    const formattedHours = validHours.toString().padStart(2, "0");
    const formattedMinutes = validMinutes.toString().padStart(2, "0");
    
    onChange(`${formattedHours}:${formattedMinutes}`);
  };

  // Handlers for the buttons
  const increaseHours = () => updateTime(hours + 1, minutes);
  const decreaseHours = () => updateTime(hours - 1, minutes);
  const increaseMinutes = () => updateTime(hours, minutes + 5);
  const decreaseMinutes = () => updateTime(hours, minutes - 5);

  return (
    <div className={cn("flex items-center", className)}>
      <div className="grid grid-cols-2 gap-1">
        <div className="flex flex-col items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={increaseHours}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Input
            id={id}
            value={
              (hours === 0 
                ? "12" 
                : hours > 12 
                  ? (hours - 12).toString().padStart(2, "0") 
                  : hours.toString().padStart(2, "0")
              ) + ":" + minutes.toString().padStart(2, "0")
            }
            onChange={(e) => {
              try {
                const [h, m] = e.target.value.split(":").map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                  updateTime(h, m);
                }
              } catch (error) {
                // Ignore invalid input
              }
            }}
            className="text-center w-20 h-9"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={decreaseHours}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center ml-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={increaseMinutes}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <div className="h-9 flex items-center justify-center text-sm">
            <span className="text-muted-foreground">
              {hours >= 12 ? "PM" : "AM"}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={decreaseMinutes}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}