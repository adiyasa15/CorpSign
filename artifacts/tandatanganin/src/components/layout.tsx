import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { FileText, LayoutDashboard, PenTool, Settings } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Signatures", href: "/signatures", icon: PenTool },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-card">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <PenTool className="h-6 w-6" />
            <span className="font-bold text-lg tracking-tight">Tandatanganin</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-2">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              )}>
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
              US
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">User</span>
              <span className="text-xs text-muted-foreground">user@example.com</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
