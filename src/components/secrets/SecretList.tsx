import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Pencil, Trash2, Eye, EyeOff, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SecretListProps {
  onEdit?: (id: string) => void;
  refreshTrigger?: number;
}

export function SecretList({ onEdit, refreshTrigger }: SecretListProps) {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchSecrets();
  }, [refreshTrigger]);

  const fetchSecrets = async () => {
    try {
      const { data, error } = await supabase
        .from("mikrotik_secrets")
        .select(`
          *,
          customers (
            name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSecrets(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch secrets");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("mikrotik_secrets")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast.success("Secret deleted successfully");
      fetchSecrets();
    } catch (error: any) {
      toast.error("Failed to delete secret");
    } finally {
      setDeleteId(null);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading secrets...</div>
      </Card>
    );
  }

  if (secrets.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <Wifi className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No secrets found</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first PPPoE or Hotspot secret</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {secrets.map((secret) => (
              <TableRow key={secret.id}>
                <TableCell className="font-medium">{secret.username}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {showPassword[secret.id] ? secret.password : "••••••••"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => togglePasswordVisibility(secret.id)}
                    >
                      {showPassword[secret.id] ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={secret.service === "pppoe" ? "default" : "secondary"}>
                    {secret.service.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{secret.customers?.name || "-"}</TableCell>
                <TableCell>{secret.profile || "-"}</TableCell>
                <TableCell>
                  <Badge variant={secret.disabled ? "destructive" : "secondary"}>
                    {secret.disabled ? "Disabled" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit?.(secret.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(secret.id)}
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
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this secret? This action cannot be undone.
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