import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ReactNode } from "react";
import { Moon, Sun, Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Default to dark mode (Horizon UI default)
    document.documentElement.classList.add("dark");
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Horizon UI Style Header */}
          <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              
              {/* Search Bar */}
              <div className="relative hidden md:flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search..." 
                  className="w-64 pl-10 bg-secondary/50 border-0 focus-visible:ring-primary/50 rounded-2xl"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Notifications */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative rounded-xl hover:bg-secondary"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>

              {/* Theme Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme}
                className="rounded-xl hover:bg-secondary"
              >
                {isDark ? (
                  <Sun className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Moon className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>

              {/* User Avatar */}
              <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center text-white font-semibold text-sm">
                AD
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
