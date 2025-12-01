import { useState, useEffect } from "react";
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
import { Edit, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
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

interface Package {
  id: string;
  name: string;
  type: string;
  bandwidth: string;
  burst: string | null;
  priority: number | null;
  price: number;
  created_at: string;
}

interface PackageListProps {
  onEdit: (pkg: Package) => void;
  refreshTrigger: number;
}

export function PackageList({ onEdit, refreshTrigger }: PackageListProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPackages(data || []);
    } catch (error: any) {
      toast.error("Failed to load packages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, [refreshTrigger]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("packages")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast.success("Package deleted successfully");
      fetchPackages();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete package");
    } finally {
      setDeleteId(null);
    }
  };

  const handleSync = async (packageId: string) => {
    setSyncingId(packageId);
    try {
      const response = await api.syncPackageToMikrotik(packageId);

      if (response.success) {
        toast.success("Package synced to Mikrotik successfully");
      } else {
        toast.error(response.error || "Failed to sync package to Mikrotik");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sync package to Mikrotik");
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border border-muted p-8">
        <div className="text-center text-muted-foreground">Loading packages...</div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="rounded-md border border-muted p-12">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No packages found</p>
          <p className="text-sm text-muted-foreground">Create your first package to get started</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-muted/50">
            <TableHead className="font-semibold">Name</TableHead>
            <TableHead className="font-semibold">Type</TableHead>
            <TableHead className="font-semibold">Bandwidth</TableHead>
            <TableHead className="font-semibold">Burst</TableHead>
            <TableHead className="font-semibold">Priority</TableHead>
            <TableHead className="font-semibold">Price</TableHead>
            <TableHead className="text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((pkg) => (
            <TableRow key={pkg.id} className="border-muted/50">
              <TableCell className="font-medium">{pkg.name}</TableCell>
                <TableCell>
                  <Badge variant={pkg.type === "pppoe" ? "default" : "secondary"}>
                    {pkg.type.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{pkg.bandwidth}</TableCell>
                <TableCell>{pkg.burst || "-"}</TableCell>
                <TableCell>{pkg.priority || "-"}</TableCell>
                <TableCell>Rp {pkg.price.toLocaleString("id-ID")}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSync(pkg.id)}
                      disabled={syncingId === pkg.id}
                      title="Sync to Mikrotik"
                      className="hover:bg-primary/10 hover:text-primary"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingId === pkg.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(pkg)}
                      className="hover:bg-primary/10 hover:text-primary"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(pkg.id)}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this package? This action cannot be undone.
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
