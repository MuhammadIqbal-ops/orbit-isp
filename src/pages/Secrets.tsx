import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SecretForm } from "@/components/secrets/SecretForm";
import { SecretList } from "@/components/secrets/SecretList";
import { Key, Plus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Secrets() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [importing, setImporting] = useState(false);

  const handleEdit = (id: string) => {
    setEditId(id);
    setShowForm(true);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditId(undefined);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditId(undefined);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login first");
        return;
      }

      const { data, error } = await supabase.functions.invoke('mikrotik-import-secrets', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        setRefreshTrigger(prev => prev + 1);
      } else {
        toast.error(data.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import secrets from MikroTik');
    } finally {
      setImporting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Secrets Management
            </h2>
            <p className="text-muted-foreground">
              Manage PPPoE and Hotspot credentials for MikroTik
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleImport}
              disabled={importing}
            >
              <Download className="mr-2 h-4 w-4" />
              {importing ? 'Importing...' : 'Import from MikroTik'}
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Secret
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>MikroTik Secrets</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <SecretList onEdit={handleEdit} refreshTrigger={refreshTrigger} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {editId ? "Edit Secret" : "Create New Secret"}
            </DialogTitle>
          </DialogHeader>
          <SecretForm secretId={editId} onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}