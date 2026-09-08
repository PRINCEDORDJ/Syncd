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
