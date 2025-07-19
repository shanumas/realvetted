import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimeInput({ id, value, onChange, className }: TimeInputProps) {
  // Generate time slots with 30-minute intervals from 6 AM to 10 PM
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 22; hour++) {
      // For each hour, add both XX:00 and XX:30
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour;
      
      // Add XX:00 slot
      slots.push({
        label: `${displayHour}:00 ${ampm}`,
        value: `${hour.toString().padStart(2, '0')}:00`
      });
      
      // Add XX:30 slot
      slots.push({
        label: `${displayHour}:30 ${ampm}`,
        value: `${hour.toString().padStart(2, '0')}:30`
      });
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent>
        {timeSlots.map((slot) => (
          <SelectItem key={slot.value} value={slot.value}>
            {slot.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
