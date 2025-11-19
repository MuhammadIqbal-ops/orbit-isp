import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceList } from "@/components/invoices/InvoiceList";

export default function Invoices() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Invoices
          </h2>
          <p className="text-muted-foreground">
            Track and manage billing invoices
          </p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Invoice List</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceList />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
