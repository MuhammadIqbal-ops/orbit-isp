import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cpu, HardDrive, Clock, Thermometer } from "lucide-react";
import { api } from "@/lib/api";

interface SystemData {
  cpu: number;
  memory: number;
  uptime: string;
  version: string;
  board: string;
  temperature: number;
}

export function SystemStats() {
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSystemData = async () => {
    try {
      const response = await api.getMikrotikSystem();
      
      if (response.success && response.data) {
        setSystemData(response.data as SystemData);
      } else {
        setSystemData(null);
      }
      setLoading(false);
    } catch (error: unknown) {
      console.error("MikroTik system data error:", error);
      setSystemData(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">Loading system stats...</div>;
  }

  if (!systemData) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <Cpu className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Cannot connect to MikroTik router</p>
          <p className="text-xs text-muted-foreground mt-1">Please check router settings and connection</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
          <Cpu className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{systemData.cpu}%</div>
          <Progress value={systemData.cpu} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Memory</CardTitle>
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{systemData.memory}%</div>
          <Progress value={systemData.memory} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Uptime</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{systemData.uptime}</div>
          <p className="text-xs text-muted-foreground mt-1">{systemData.version}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Temperature</CardTitle>
          <Thermometer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{systemData.temperature}°C</div>
          <p className="text-xs text-muted-foreground mt-1">{systemData.board}</p>
        </CardContent>
      </Card>
    </div>
  );
}
