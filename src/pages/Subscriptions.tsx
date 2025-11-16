import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Subscriptions() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Subscriptions</h2>
            <p className="text-muted-foreground">Manage customer subscriptions</p>
          </div>
          <Button className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            New Subscription
          </Button>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Subscription management coming soon. This will sync with Mikrotik to create PPPoE users and manage quotas.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
