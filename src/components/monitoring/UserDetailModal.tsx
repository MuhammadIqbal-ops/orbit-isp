import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { 
  User, 
  Clock, 
  Globe, 
  TrendingDown, 
  TrendingUp, 
  Package, 
  Wifi,
  Activity,
  Network,
  FileText
} from "lucide-react";

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  type: string;
}

interface UserDetail {
  username: string;
  type: string;
  session: {
    id: string;
    address: string;
    macAddress: string;
    uptime: string;
    encoding: string;
    service: string;
  };
  bandwidth: {
    rxRate: string;
    txRate: string;
    rxBytes: string;
    txBytes: string;
    rxPackets: string;
    txPackets: string;
  };
  profile: {
    profile: string;
    service: string;
    limitAt: string;
    maxLimit: string;
    comment: string;
  } | null;
}

export function UserDetailModal({ isOpen, onClose, username, type }: UserDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);

  const fetchUserDetail = async () => {
    setLoading(true);
    try {
      const response = await api.getMikrotikUserDetail(username, type);

      if (response.success && response.data) {
        setUserDetail(response.data as UserDetail);
      } else {
        toast.error("Failed to fetch user details");
        setUserDetail(null);
      }
    } catch (error: unknown) {
      toast.error("Failed to fetch user details");
      console.error(error);
      setUserDetail(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch details when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUserDetail();
    }
  }, [isOpen, username, type]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Session Details
          </DialogTitle>
          <DialogDescription>
            Detailed information and statistics for {username}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Activity className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : userDetail ? (
          <div className="space-y-4">
            {/* User Info */}
            <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{userDetail.username}</h3>
                  <p className="text-sm text-muted-foreground">Session ID: {userDetail.session.id}</p>
                </div>
                <Badge variant={type === "pppoe" ? "default" : "secondary"} className="text-base px-4 py-1">
                  {type.toUpperCase()}
                </Badge>
              </div>
            </Card>

            {/* Session Information */}
            <Card className="p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Network className="h-4 w-4" />
                Session Information
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">IP Address</p>
                    <p className="font-medium font-mono">{userDetail.session.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">MAC Address</p>
                    <p className="font-medium font-mono text-sm">{userDetail.session.macAddress}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="font-medium">{userDetail.session.uptime}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Service</p>
                    <p className="font-medium">{userDetail.session.service}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Bandwidth Statistics */}
            <Card className="p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Bandwidth Statistics
              </h4>
              
              {/* Current Rate */}
              <div className="space-y-3">
                <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium">Download Rate</span>
                    </div>
                    <span className="text-lg font-bold text-success">{userDetail.bandwidth.rxRate}/s</span>
                  </div>
                </div>
                
                <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium">Upload Rate</span>
                    </div>
                    <span className="text-lg font-bold text-warning">{userDetail.bandwidth.txRate}/s</span>
                  </div>
                </div>
              </div>

              {/* Total Usage */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2">Total Usage</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Downloaded</p>
                    <p className="font-semibold text-success">{userDetail.bandwidth.rxBytes}</p>
                    <p className="text-xs text-muted-foreground mt-1">{userDetail.bandwidth.rxPackets} packets</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Uploaded</p>
                    <p className="font-semibold text-warning">{userDetail.bandwidth.txBytes}</p>
                    <p className="text-xs text-muted-foreground mt-1">{userDetail.bandwidth.txPackets} packets</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Profile Information */}
            {userDetail.profile && (
              <Card className="p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Profile Information
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm text-muted-foreground">Profile</span>
                    <span className="font-medium">{userDetail.profile.profile}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm text-muted-foreground">Max Limit</span>
                    <span className="font-medium">{userDetail.profile.maxLimit}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm text-muted-foreground">Limit At</span>
                    <span className="font-medium">{userDetail.profile.limitAt}</span>
                  </div>
                  {userDetail.profile.comment && (
                    <div className="flex items-start gap-2 p-2 bg-muted rounded">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Comment</p>
                        <p className="text-sm">{userDetail.profile.comment}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Failed to load user details
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
