import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Upload, BarChart3, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "דשבורד", icon: LayoutDashboard },
  { path: "/suppliers", label: "ספקים", icon: Users },
  { path: "/agreements", label: "הסכמי בונוסים", icon: FileText },
  { path: "/transactions", label: "בונוס עסקה", icon: TrendingUp },
  { path: "/upload", label: "העלאת נתונים", icon: Upload },
  { path: "/reports", label: "דוחות ורווחיות", icon: BarChart3 },
  { path: "/alerts", label: "התראות יעדים", icon: AlertTriangle },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-l border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border">
          <h1 className="text-xl font-bold text-sidebar-primary">
            💰 WE LOVE
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
