import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CreditCard,
  Settings,
  Activity,
  Wifi,
  LogOut,
  Key,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users, showBadge: true, badgeKey: "customers" },
  { title: "Packages", url: "/packages", icon: Package, showBadge: true, badgeKey: "packages" },
  { title: "Subscriptions", url: "/subscriptions", icon: Wifi, showBadge: true, badgeKey: "online-detail" },
  { title: "Secrets", url: "/secrets", icon: Key, showBadge: false },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Monitoring", url: "/monitoring", icon: Activity, showBadge: true, badgeKey: "online-total" },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;

  // Fetch real-time statistics
  const { data: customersCount } = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("customers").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: packagesCount } = useQuery({
    queryKey: ["packages-count"],
    queryFn: async () => {
      const { count } = await supabase.from("packages").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: onlineUsers } = useQuery({
    queryKey: ["mikrotik-online-sidebar"],
    queryFn: async () => {
      try {
        const response = await api.getMikrotikOnlineUsers();
        if (response.success && response.data) {
          const users = response.data as any[];
          const pppoeCount = users.filter((u: any) => u.type === "pppoe")?.length || 0;
          const hotspotCount = users.filter((u: any) => u.type === "hotspot")?.length || 0;
          
          return {
            total: users.length || 0,
            pppoe: pppoeCount,
            hotspot: hotspotCount,
          };
        }
        return { total: 0, pppoe: 0, hotspot: 0 };
      } catch (error) {
        console.error("MikroTik connection error:", error);
        return { total: 0, pppoe: 0, hotspot: 0 };
      }
    },
    refetchInterval: 10000,
    retry: 2,
    retryDelay: 1000,
  });

  const getBadgeValue = (key: string) => {
    switch (key) {
      case "customers":
        return customersCount;
      case "packages":
        return packagesCount;
      case "online-detail":
        return onlineUsers ? `${onlineUsers.pppoe}/${onlineUsers.hotspot}` : "0/0";
      case "online-total":
        return onlineUsers?.total || 0;
      default:
        return null;
    }
  };

  return (
    <Sidebar className={`${collapsed ? "w-20" : "w-72"} border-r-0 bg-sidebar transition-all duration-300`}>
      <SidebarContent className="px-3">
        {/* Logo Section */}
        <div className="p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-brand">
              <Wifi className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div>
                <span className="text-lg font-bold text-sidebar-foreground">ISP Billing</span>
                <p className="text-xs text-sidebar-foreground/60">Management System</p>
              </div>
            )}
          </div>
        </div>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider px-3 mb-2">
              Main Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                const badgeValue = item.showBadge && item.badgeKey ? getBadgeValue(item.badgeKey) : null;
                const active = isActive(item.url);
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                          ${active 
                            ? "bg-gradient-brand text-white shadow-brand" 
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          }`}
                        activeClassName=""
                      >
                        <item.icon className={`h-5 w-5 ${active ? "" : "opacity-70"}`} />
                        {!collapsed && (
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium">{item.title}</span>
                            {badgeValue !== null && badgeValue !== undefined && (
                              <Badge 
                                variant="secondary" 
                                className={`ml-auto text-xs px-2 py-0.5 rounded-lg
                                  ${active 
                                    ? "bg-white/20 text-white border-0" 
                                    : "bg-sidebar-accent text-sidebar-foreground/70"
                                  }`}
                              >
                                {badgeValue}
                              </Badge>
                            )}
                          </div>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        {/* User Info Card */}
        <div className={`p-3 rounded-2xl bg-sidebar-accent/50 ${collapsed ? "flex justify-center" : ""}`}>
          {!collapsed && user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.email?.split('@')[0]}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">
                {user.email}
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            onClick={signOut}
            className={`w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-destructive/80 rounded-xl transition-all
              ${collapsed ? "h-10 w-10" : ""}`}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
