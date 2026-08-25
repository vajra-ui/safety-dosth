import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, MapPin, Users } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const TABS = [
  { to: "/home", label: "Navigate", icon: Compass },
  { to: "/places", label: "Safe places", icon: MapPin },
  { to: "/circle", label: "Circle", icon: Users },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  padded = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  padded?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnlineStatus();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {title ? (
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-5 py-3 backdrop-blur">
          <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </header>
      ) : null}

      {!online ? (
        <p className="bg-caution-soft px-5 py-2 text-center text-xs text-caution-foreground">
          You're offline — live safety data is unavailable until you reconnect.
        </p>
      ) : null}

      <main className={`flex-1 ${padded ? "px-5 py-4 pb-28" : "pb-24"}`}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 py-1.5">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <li key={tab.to} className="flex-1">
                <Link
                  to={tab.to}
                  className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
