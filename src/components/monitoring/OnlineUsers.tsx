import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Wifi, Clock, TrendingDown, TrendingUp, Signal } from "lucide-react";

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Signal className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-muted-foreground">Loading online users...</p>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No users currently online</p>
        </div>
      </div>
    );
  }

  const pppoeUsers = users.filter(u => u.type === "pppoe");
  const hotspotUsers = users.filter(u => u.type === "hotspot");

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Online</p>
              <p className="text-3xl font-bold text-primary">{users.length}</p>
            </div>
            <Wifi className="h-8 w-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">PPPoE Users</p>
              <p className="text-3xl font-bold text-accent">{pppoeUsers.length}</p>
            </div>
            <Signal className="h-8 w-8 text-accent" />
          </div>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-secondary-foreground/10 to-secondary-foreground/5 border-secondary-foreground/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Hotspot Users</p>
              <p className="text-3xl font-bold text-secondary-foreground">{hotspotUsers.length}</p>
            </div>
            <Users className="h-8 w-8 text-secondary-foreground" />
          </div>
        </Card>
      </div>

      {/* User Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Card key={user.id} className="p-5 hover:shadow-lg transition-shadow duration-300 border-l-4" 
                style={{ borderLeftColor: user.type === "pppoe" ? "hsl(var(--primary))" : "hsl(var(--secondary-foreground))" }}>
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{user.username}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{user.address}</p>
                </div>
                <Badge 
                  variant={user.type === "pppoe" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {user.type.toUpperCase()}
                </Badge>
              </div>

              {/* Stats */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Uptime:</span>
                  <span className="font-medium ml-auto">{user.uptime}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <TrendingDown className="h-4 w-4 text-success" />
                  <span className="text-muted-foreground">Download:</span>
                  <span className="font-medium ml-auto text-success">{user.downloadSpeed}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-warning" />
                  <span className="text-muted-foreground">Upload:</span>
                  <span className="font-medium ml-auto text-warning">{user.uploadSpeed}</span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2 pt-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-xs text-success font-medium">Active</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
