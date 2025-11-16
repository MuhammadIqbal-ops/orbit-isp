import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const [routerSettings, setRouterSettings] = useState({
    host: "",
    port: "8728",
    username: "",
    password: "",
    ssl: false,
  });

  const handleSaveRouter = () => {
    toast.success("Router settings will be saved after backend integration");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
          <p className="text-muted-foreground">Configure your system preferences</p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Mikrotik Router Configuration</CardTitle>
            <CardDescription>
              Connect to your Mikrotik router for automated management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="host">Router IP / Hostname</Label>
                <Input
                  id="host"
                  placeholder="192.168.88.1"
                  value={routerSettings.host}
                  onChange={(e) =>
                    setRouterSettings({ ...routerSettings, host: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">API Port</Label>
                <Input
                  id="port"
                  placeholder="8728"
                  value={routerSettings.port}
                  onChange={(e) =>
                    setRouterSettings({ ...routerSettings, port: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={routerSettings.username}
                  onChange={(e) =>
                    setRouterSettings({ ...routerSettings, username: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={routerSettings.password}
                  onChange={(e) =>
                    setRouterSettings({ ...routerSettings, password: e.target.value })
                  }
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="ssl"
                checked={routerSettings.ssl}
                onCheckedChange={(checked) =>
                  setRouterSettings({ ...routerSettings, ssl: checked })
                }
              />
              <Label htmlFor="ssl">Use SSL Connection</Label>
            </div>

            <Button onClick={handleSaveRouter} className="shadow-soft">
              Test & Save Connection
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>System Preferences</CardTitle>
            <CardDescription>General application settings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Additional settings for SMTP, branding, and automation will be available here.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
