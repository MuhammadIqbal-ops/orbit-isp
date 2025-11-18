import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TrafficData {
  time: string;
  download: number;
  upload: number;
}

export function TrafficGraph() {
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);

  const fetchTrafficData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("mikrotik-traffic");
      
      if (error) throw error;
      setTrafficData(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch traffic data");
    }
  };

  useEffect(() => {
    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={trafficData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis label={{ value: "Mbps", angle: -90, position: "insideLeft" }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="download" stroke="hsl(var(--primary))" strokeWidth={2} name="Download" />
        <Line type="monotone" dataKey="upload" stroke="hsl(var(--secondary))" strokeWidth={2} name="Upload" />
      </LineChart>
    </ResponsiveContainer>
  );
}
