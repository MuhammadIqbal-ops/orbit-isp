import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemStats } from "@/components/monitoring/SystemStats";
import { OnlineUsers } from "@/components/monitoring/OnlineUsers";
import { TrafficGraph } from "@/components/monitoring/TrafficGraph";
import { Activity, TrendingUp } from "lucide-react";

export default function Monitoring() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              MikroTik Monitoring
            </h2>
            <p className="text-muted-foreground">
              Real-time system resources and network traffic
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            <span className="text-sm font-medium text-primary">Live</span>
          </div>
        </div>

        <SystemStats />

        <Card className="shadow-lg border-t-4 border-t-primary">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Network Traffic</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <TrafficGraph />
          </CardContent>
        </Card>

        <div>
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-foreground">Active Users</h3>
            <p className="text-sm text-muted-foreground">PPPoE and Hotspot users currently connected</p>
          </div>
          <OnlineUsers />
        </div>
      </div>
    </DashboardLayout>
  );
}
