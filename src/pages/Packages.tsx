import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { PackageForm } from "@/components/packages/PackageForm";
import { PackageList } from "@/components/packages/PackageList";

export default function Packages() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSuccess = () => {
    setIsDialogOpen(false);
    setEditingPackage(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleEdit = (pkg: any) => {
    setEditingPackage(pkg);
    setIsDialogOpen(true);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingPackage(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Service Packages</h2>
            <p className="text-muted-foreground">Create and manage bandwidth packages for your customers</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            Create Package
          </Button>
        </div>

        <Card className="shadow-soft border-muted/50">
          <CardContent className="p-0">
            <PackageList onEdit={handleEdit} refreshTrigger={refreshTrigger} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? "Edit Package" : "Create New Package"}
            </DialogTitle>
            <DialogDescription>
              Configure PPPoE or Hotspot package with bandwidth limits and pricing
            </DialogDescription>
          </DialogHeader>
          <PackageForm
            packageData={editingPackage}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
