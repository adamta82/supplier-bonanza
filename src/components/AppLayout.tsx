import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Upload, BarChart3, AlertTriangle, TrendingUp, CircleAlert, FileCheck, UserCog, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "דשבורד", icon: LayoutDashboard },
  { path: "/suppliers", label: "ספקים", icon: Users },
  { path: "/agreements", label: "הסכמי בונוסים", icon: FileText },
  { path: "/transactions", label: "בונוס עסקה", icon: TrendingUp },
  { path: "/upload", label: "העלאת נתונים", icon: Upload },
  { path: "/reports", label: "דוחות ורווחיות", icon: BarChart3 },
  { path: "/alerts", label: "התראות יעדים", icon: AlertTriangle },
  { path: "/errors", label: "שגויים", icon: CircleAlert },
  { path: "/reconciliation", label: "התאמת מסמכים", icon: FileCheck },
  { path: "/users", label: "ניהול משתמשים", icon: UserCog },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-l border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border">
          <h1 className="text-xl font-bold text-sidebar-primary">
            💰 ZABILO MARGIN
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-1">ניהול בונוסים ורווחיות</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={signOut}
          >
            <LogOut className="w-5 h-5" />
            התנתק
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
