import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Customers() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Customers</h2>
            <p className="text-muted-foreground">Manage your customer database</p>
          </div>
          <Button className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Customer management interface coming soon. This will include table with search, filtering, and CRUD operations.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
