import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Edit, Trash2, Power, PowerOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SubscriptionListProps {
  onEdit: (subscription: any) => void;
  refreshTrigger: number;
}

export function SubscriptionList({
  onEdit,
  refreshTrigger,
}: SubscriptionListProps) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptions();
  }, [refreshTrigger]);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          `
          *,
          customers(name),
          packages(name, bandwidth)
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error: any) {
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast.success("Subscription deleted successfully");
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete subscription");
    } finally {
      setDeleteId(null);
    }
  };

  const toggleStatus = async (subscription: any) => {
    const newStatus =
      subscription.status === "active" ? "suspended" : "active";

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: newStatus })
        .eq("id", subscription.id);

      if (error) throw error;

      // Call Mikrotik to enable/disable user
      await supabase.functions.invoke("mikrotik-toggle-user", {
        body: {
          username: subscription.mikrotik_username,
          enable: newStatus === "active",
        },
      });

      toast.success(
        `Subscription ${newStatus === "active" ? "activated" : "suspended"}`
      );
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to update subscription");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "suspended":
        return "bg-yellow-500";
      case "expired":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading subscriptions...</div>;
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>PPPoE Username</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Auto Renew</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No subscriptions found
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium">
                    {subscription.customers?.name}
                  </TableCell>
                  <TableCell>
                    {subscription.packages?.name}
                    <div className="text-xs text-muted-foreground">
                      {subscription.packages?.bandwidth}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {subscription.mikrotik_username}
                  </TableCell>
                  <TableCell>
                    {new Date(subscription.start_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {new Date(subscription.end_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(subscription.status)}>
                      {subscription.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {subscription.auto_renew ? "Yes" : "No"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleStatus(subscription)}
                        title={
                          subscription.status === "active"
                            ? "Suspend"
                            : "Activate"
                        }
                      >
                        {subscription.status === "active" ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(subscription)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(subscription.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this subscription? This will also
              remove the user from Mikrotik. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
