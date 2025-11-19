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
import { SubscriptionForm } from "@/components/subscriptions/SubscriptionForm";
import { SubscriptionList } from "@/components/subscriptions/SubscriptionList";

export default function Subscriptions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSuccess = () => {
    setIsDialogOpen(false);
    setEditingSubscription(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleEdit = (subscription: any) => {
    setEditingSubscription(subscription);
    setIsDialogOpen(true);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingSubscription(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Subscriptions
            </h2>
            <p className="text-muted-foreground">
              Manage customer subscriptions and PPPoE users
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} className="shadow-soft">
            <Plus className="mr-2 h-4 w-4" />
            New Subscription
          </Button>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <SubscriptionList
              onEdit={handleEdit}
              refreshTrigger={refreshTrigger}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSubscription
                ? "Edit Subscription"
                : "Create New Subscription"}
            </DialogTitle>
            <DialogDescription>
              Configure customer subscription and create PPPoE user in Mikrotik
            </DialogDescription>
          </DialogHeader>
          <SubscriptionForm
            subscriptionData={editingSubscription}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
