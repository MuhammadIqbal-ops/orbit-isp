import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, DollarSign, Activity, TrendingUp, AlertCircle, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

  const { data: expiringSoon } = useQuery({
    queryKey: ["expiring-soon"],
    queryFn: async () => {
      const today = new Date();
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);
      
      const { data } = await supabase
        .from("subscriptions")
        .select("*, customers(name), packages(name)")
        .eq("status", "active")
        .gte("end_date", today.toISOString().split("T")[0])
        .lte("end_date", sevenDaysFromNow.toISOString().split("T")[0])
        .order("end_date", { ascending: true })
        .limit(5);
      
      return data || [];
    },
  });

  const { data: overdueInvoices } = useQuery({
    queryKey: ["overdue-invoices"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data } = await supabase
        .from("invoices")
        .select("*, subscriptions(*, customers(name), packages(name))")
        .eq("status", "unpaid")
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(5);
      
      return data || [];
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

        {overdueInvoices && overdueInvoices.length > 0 && (
          <Alert variant="destructive" className="shadow-soft">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''} that need attention.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-warning" />
                Subscriptions Expiring Soon
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!expiringSoon || expiringSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subscriptions expiring in the next 7 days
                </p>
              ) : (
                <div className="space-y-3">
                  {expiringSoon.map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{sub.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{sub.packages?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-warning font-medium">
                          {new Date(sub.end_date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Overdue Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!overdueInvoices || overdueInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No overdue invoices
                </p>
              ) : (
                <div className="space-y-3">
                  {overdueInvoices.map((invoice: any) => (
                    <div key={invoice.id} className="flex items-center justify-between p-2 rounded-lg bg-destructive/5">
                      <div>
                        <p className="text-sm font-medium">{invoice.subscriptions?.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Rp {Number(invoice.amount).toLocaleString("id-ID")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-destructive font-medium">
                          Due: {new Date(invoice.due_date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
