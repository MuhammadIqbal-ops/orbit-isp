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
  { title: "Secrets", url: "/secrets", icon: LogOut, showBadge: false },
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
    <Sidebar className={collapsed ? "w-14" : "w-60"}>
      <SidebarContent>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Wifi className="h-6 w-6 text-primary" />
            {!collapsed && <span className="text-lg font-bold text-sidebar-foreground">ISP Billing</span>}
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const badgeValue = item.showBadge && item.badgeKey ? getBadgeValue(item.badgeKey) : null;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center gap-2 hover:bg-sidebar-accent rounded-md transition-smooth"
                        activeClassName="bg-sidebar-accent text-primary font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && (
                          <div className="flex items-center justify-between w-full">
                            <span>{item.title}</span>
                            {badgeValue !== null && badgeValue !== undefined && (
                              <Badge 
                                variant="secondary" 
                                className="ml-auto text-xs px-2 py-0.5"
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

      <SidebarFooter>
        <div className="p-4">
          {!collapsed && user && (
            <div className="mb-2 text-xs text-sidebar-foreground/70">
              {user.email}
            </div>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
