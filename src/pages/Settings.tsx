import { DashboardLayout } from "@/components/DashboardLayout";
import { RouterSettings } from "@/components/settings/RouterSettings";
import { RadiusSettings } from "@/components/settings/RadiusSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Radio } from "lucide-react";

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
          <p className="text-muted-foreground">Configure your system and integration settings</p>
        </div>

        <Tabs defaultValue="mikrotik" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="mikrotik" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Mikrotik
            </TabsTrigger>
            <TabsTrigger value="radius" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              FreeRADIUS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mikrotik">
            <RouterSettings />
          </TabsContent>

          <TabsContent value="radius">
            <RadiusSettings />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
