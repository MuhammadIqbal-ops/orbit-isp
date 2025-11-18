import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemStats } from "@/components/monitoring/SystemStats";
import { OnlineUsers } from "@/components/monitoring/OnlineUsers";
import { TrafficGraph } from "@/components/monitoring/TrafficGraph";
import { Activity } from "lucide-react";

export default function Monitoring() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Mikrotik Monitoring
            </h2>
            <p className="text-muted-foreground">
              Real-time system resources and network traffic
            </p>
          </div>
          <Activity className="h-8 w-8 text-muted-foreground" />
        </div>

        <SystemStats />

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Network Traffic</CardTitle>
          </CardHeader>
          <CardContent>
            <TrafficGraph />
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Online Users</CardTitle>
          </CardHeader>
          <CardContent>
            <OnlineUsers />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
