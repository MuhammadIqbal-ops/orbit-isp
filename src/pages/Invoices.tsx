import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Invoices() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Invoices</h2>
          <p className="text-muted-foreground">Track and manage billing invoices</p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Invoice List</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Invoice management coming soon. Auto-generate invoices, track payment status, and send reminders.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
