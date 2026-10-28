import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
/** Native details semantics with the same quiet indicator across the application. */
export const DisclosureSummary=forwardRef<HTMLElement,ComponentPropsWithoutRef<"summary">&{indicator?:boolean}>(function DisclosureSummary({children,className,indicator=true,...props},ref){
  return <summary ref={ref} className={cn("flex cursor-pointer list-none items-center justify-between gap-2 outline-offset-2",className)} {...props}>{children}{indicator&&<ChevronDown aria-hidden="true" data-disclosure-indicator className="ml-auto h-4 w-4 shrink-0 opacity-60 transition-transform"/>}</summary>;
});
