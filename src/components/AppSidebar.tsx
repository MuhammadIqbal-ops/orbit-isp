import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Packages", url: "/packages", icon: Package },
  { title: "Subscriptions", url: "/subscriptions", icon: Wifi },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Monitoring", url: "/monitoring", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;

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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2 hover:bg-sidebar-accent rounded-md transition-smooth"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
