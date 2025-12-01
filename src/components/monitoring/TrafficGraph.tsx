import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

interface TrafficData {
  time: string;
  download: number;
  upload: number;
}

export function TrafficGraph() {
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);

  const fetchTrafficData = async () => {
    try {
      const response = await api.getMikrotikTraffic();
      
      if (response.success && response.data) {
        setTrafficData(response.data as TrafficData[]);
      }
    } catch (error: unknown) {
      console.error("MikroTik traffic data error:", error);
      if (trafficData.length === 0) {
        setTrafficData([]);
      }
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
