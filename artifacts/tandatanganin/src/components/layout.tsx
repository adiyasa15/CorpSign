import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  FileText, LayoutDashboard, PenTool, Settings, Users, LogOut,
  PenLine, Upload, ChevronUp, ShieldCheck, Menu, X, ChevronDown, Check,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetTrigger,
} from "@/components/ui/sheet";

function FlagGB({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className={cn("rounded-sm shrink-0", className)}>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function FlagID({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" className={cn("rounded-sm shrink-0", className)}>
      <rect width="30" height="10" fill="#CE1126" />
      <rect y="10" width="30" height="10" fill="#FFFFFF" />
    </svg>
  );
}

function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const FlagIcon = language === "en" ? FlagGB : FlagID;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-secondary transition-colors font-medium text-xs text-foreground",
            compact ? "px-2 py-1" : "px-2.5 py-1.5",
          )}
        >
          <FlagIcon className={compact ? "h-3 w-[18px]" : "h-3.5 w-5"} />
          <span>{language === "en" ? "EN" : "ID"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => setLanguage("en")}
          className={cn("gap-2", language === "en" && "text-primary")}
        >
          <FlagGB className="h-3.5 w-5" />
          <span className="flex-1">English</span>
          {language === "en" && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("id")}
          className={cn("gap-2", language === "id" && "text-primary")}
        >
          <FlagID className="h-3.5 w-5" />
          <span className="flex-1">Indonesia</span>
          {language === "id" && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.assign("/login");
      },
    });
  };

  const navItems = [
    { name: t("nav_dashboard"), href: "/", icon: LayoutDashboard },
    { name: t("nav_documents"), href: "/documents", icon: FileText },
    { name: t("nav_signatures"), href: "/signatures", icon: PenTool },
    { name: t("nav_settings"), href: "/settings", icon: Settings },
  ];

  if (user?.role === "admin" || user?.role === "superadmin") {
    navItems.splice(3, 0, { name: t("nav_users"), href: "/users", icon: Users });
  }

  if (user?.role === "superadmin") {
    navItems.splice(4, 0, { name: t("nav_privileges"), href: "/privileges", icon: ShieldCheck });
  }

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-2">
          {t("nav_menu")}
        </div>
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}

        {user?.role !== "approver" && (
          <div className="pt-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
              {t("nav_quick_actions")}
            </div>
            <Link
              href="/documents/upload"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                location === "/documents/upload"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
              )}
            >
              <Upload className="h-4 w-4 shrink-0" />
              {t("nav_upload")}
            </Link>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary transition-colors group">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
                {getInitials(user?.name)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{user?.name ?? "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
              </div>
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{t("nav_signed_in_as")}</p>
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <Badge variant="outline" className="capitalize text-xs font-normal mt-1">
                {user?.role ?? "user"}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setLocation("/signature-settings"); onNavigate?.(); }}>
              <PenLine className="h-4 w-4 mr-2" />
              {t("nav_signature_settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setLocation("/settings"); onNavigate?.(); }}>
              <Settings className="h-4 w-4 mr-2" />
              {t("nav_account_settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("nav_logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 border-b border-border bg-card/95 backdrop-blur-sm">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-3 h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
              <div className="flex items-center gap-2 text-primary">
                <PenTool className="h-5 w-5" />
                <span className="font-bold text-base tracking-tight">Tandatanganin</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 flex flex-col overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 text-primary flex-1 min-w-0">
          <PenTool className="h-5 w-5 shrink-0" />
          <span className="font-bold text-base tracking-tight truncate">Tandatanganin</span>
        </div>
        <LanguageToggle compact />
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card shrink-0">
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <PenTool className="h-6 w-6" />
            <span className="font-bold text-lg tracking-tight">Tandatanganin</span>
          </div>
          <LanguageToggle />
        </div>
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
