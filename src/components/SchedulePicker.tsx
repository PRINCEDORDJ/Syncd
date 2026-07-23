import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function tomorrowAt9(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function combine(date: Date, time: string): Date {
  const [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
  const d = new Date(date);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

export interface SchedulePickerProps {
  onSchedule: (iso: string) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}

export function SchedulePicker({
  onSchedule,
  submitting,
  submitLabel = "Schedule post",
}: SchedulePickerProps) {
  const initial = tomorrowAt9();
  const [date, setDate] = useState<Date>(initial);
  const [time, setTime] = useState<string>(format(initial, "HH:mm"));

  const scheduled = useMemo(() => combine(date, time), [date, time]);
  const isPast = scheduled.getTime() <= Date.now();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "flex-1 justify-start text-left font-normal h-9",
                !date && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-4 mr-2" />
              {date ? format(date, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              disabled={{ before: today }}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <div className="relative sm:w-32">
          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-full pl-8 pr-2 rounded-md border border-input bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <p
        className={cn(
          "text-[12px] font-mono",
          isPast ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {isPast
          ? "Please choose a future date and time."
          : `Scheduled for ${scheduled.toLocaleString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}`}
      </p>
      <Button
        type="button"
        disabled={isPast || submitting}
        onClick={() => onSchedule(scheduled.toISOString())}
        className="w-full sm:w-auto h-9"
      >
        {submitting ? "Scheduling…" : submitLabel}
      </Button>
    </div>
  );
}