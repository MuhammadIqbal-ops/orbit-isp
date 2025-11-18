import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OnlineUser {
  id: string;
  username: string;
  type: string;
  address: string;
  uptime: string;
  downloadSpeed: string;
  uploadSpeed: string;
}

export function OnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOnlineUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("mikrotik-online-users");
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch online users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground">Loading online users...</div>;
  }

  if (users.length === 0) {
    return <div className="text-center py-4 text-muted-foreground">No users currently online</div>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Uptime</TableHead>
            <TableHead>Download</TableHead>
            <TableHead>Upload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.username}</TableCell>
              <TableCell>
                <Badge variant={user.type === "pppoe" ? "default" : "secondary"}>
                  {user.type.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>{user.address}</TableCell>
              <TableCell>{user.uptime}</TableCell>
              <TableCell>{user.downloadSpeed}</TableCell>
              <TableCell>{user.uploadSpeed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
