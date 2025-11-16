import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Payments() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Payments</h2>
            <p className="text-muted-foreground">Record and track payments</p>
          </div>
          <Button className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Payment tracking coming soon. Record manual payments and view transaction history.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
