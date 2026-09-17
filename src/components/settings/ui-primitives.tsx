import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card as UICard } from "@/components/ui/card";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Select as UISelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Button Primitives
export const ButtonPrimary = (props: React.ComponentProps<typeof Button>) => (
  <Button {...props} variant="default" className={cn("rounded-md", props.className)} />
);

export const ButtonOutline = (props: React.ComponentProps<typeof Button>) => (
  <Button {...props} variant="outline" className={cn("rounded-md border-white/[0.08]", props.className)} />
);

export const ButtonDanger = (props: React.ComponentProps<typeof Button>) => (
  <Button {...props} variant="destructive" className={cn("rounded-md", props.className)} />
);

// Card Primitive
export const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof UICard>>(
  ({ className, ...props }, ref) => (
    <UICard 
      ref={ref} 
      className={cn("rounded-lg border-white/[0.08] bg-[#111214] shadow-none", className)} 
      {...props} 
    />
  )
);
Card.displayName = "SettingsCard";

// Badge Primitive
export const Badge = (props: React.ComponentProps<typeof UIBadge>) => (
  <UIBadge {...props} className={cn("rounded-md", props.className)} />
);

// Eyebrow Label
export const Eyebrow = ({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em]", className)}
    {...props}
  >
    {children}
  </span>
);

// Section wrapper — card-like container with title, subtitle, optional danger tone
export function Section({
  title,
  subtitle,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mb-8 rounded-xl border bg-card overflow-hidden ${
        tone === "danger" ? "border-destructive/30" : "border-border"
      }`}
    >
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

// Field — label + hint + children form field wrapper
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
