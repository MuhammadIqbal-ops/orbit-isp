import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, FileText, DollarSign, Activity, TrendingUp } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function Dashboard() {
  const { data: customersCount } = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: activeSubscriptions } = useQuery({
    queryKey: ["active-subscriptions"],
    queryFn: async () => {
      const { count } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count || 0;
    },
  });

  const { data: unpaidInvoices } = useQuery({
    queryKey: ["unpaid-invoices"],
    queryFn: async () => {
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("status", "unpaid");
      return count || 0;
    },
  });

  const { data: monthlyRevenue } = useQuery({
    queryKey: ["monthly-revenue"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      
      const { data } = await supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", startOfMonth.toISOString());
      
      return data?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    },
  });

  const stats = [
    {
      title: "Total Customers",
      value: customersCount || 0,
      icon: Users,
      trend: "+12%",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Subscriptions",
      value: activeSubscriptions || 0,
      icon: Activity,
      trend: "+8%",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Unpaid Invoices",
      value: unpaidInvoices || 0,
      icon: FileText,
      trend: "-3%",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Monthly Revenue",
      value: `Rp ${(monthlyRevenue || 0).toLocaleString("id-ID")}`,
      icon: DollarSign,
      trend: "+15%",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Overview</h2>
          <p className="text-muted-foreground">Monitor your ISP operations at a glance</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="shadow-soft hover:shadow-elegant transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-full p-2 ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <TrendingUp className="h-3 w-3 text-success" />
                  <span className="text-success">{stat.trend}</span>
                  <span>from last month</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Activity tracking coming soon. This will show recent customer registrations, payments, and system events.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Router Connection</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning">
                    Not Configured
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Database</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success">
                    Online
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
