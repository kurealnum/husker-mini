"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Top-level application routes shown in the main navigation. */
const NAV_LINKS = [
  { href: "/predictions", label: "Predictions" },
  { href: "/predictions/new", label: "New Prediction" },
  { href: "/analysis", label: "Analysis" },
  { href: "/config", label: "Config" },
] as const;

/** Main application navigation, with the current route highlighted. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4">
      {NAV_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-sm font-medium transition-colors hover:text-foreground",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
