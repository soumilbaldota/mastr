"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Mic,
  AlertTriangle,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemePicker } from "@/components/theme-picker";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/checkin", label: "Check-in", icon: Mic },
  { href: "/blockers", label: "Blockers", icon: AlertTriangle },
  { href: "/team", label: "Team", icon: Users },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center">
            <img
              src="/logo.png"
              alt="Mastr Logo"
              className="h-16 w-32 rounded-lg object-cover"
            />
        </Link>
      </div>

      <div className="flex-1 overflow-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            AI-First Project Management
          </p>
          <ThemePicker />
        </div>
      </div>
    </nav>
  );
}
