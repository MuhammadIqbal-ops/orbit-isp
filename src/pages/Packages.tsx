import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Packages() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Packages</h2>
            <p className="text-muted-foreground">Configure your service packages</p>
          </div>
          <Button className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            Add Package
          </Button>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Package List</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Package management interface coming soon. Create and manage PPPoE and Hotspot packages with bandwidth limits.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
