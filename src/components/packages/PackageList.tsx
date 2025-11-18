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
import { Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading packages...</div>;
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No packages found. Create your first package to get started.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Bandwidth</TableHead>
              <TableHead>Burst</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow key={pkg.id}>
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
                      onClick={() => onEdit(pkg)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(pkg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
