import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";


declare global {
  interface Window {
    snap: {
      pay: (token: string, options: SnapOptions) => void;
      hide: () => void;
    };
  }
}

interface SnapOptions {
  onSuccess: (result: SnapResult) => void;
  onPending: (result: SnapResult) => void;
  onError: (result: SnapResult) => void;
  onClose: () => void;
}

interface SnapResult {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_time: string;
  transaction_status: string;
  fraud_status?: string;
  pdf_url?: string;
  finish_redirect_url?: string;
}

interface MidtransPaymentProps {
  invoiceId: string;
  amount: number;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  onSuccess?: (result: SnapResult) => void;
  onPending?: (result: SnapResult) => void;
  onError?: (result: SnapResult) => void;
  onClose?: () => void;
}

type PaymentStatus = "idle" | "loading" | "success" | "pending" | "error";

export function MidtransPayment({
  invoiceId,
  amount,
  customerName,
  customerEmail,
  customerPhone,
  description,
  onSuccess,
  onPending,
  onError,
  onClose,
}: MidtransPaymentProps) {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [snapLoaded, setSnapLoaded] = useState(false);
  const [transactionResult, setTransactionResult] = useState<SnapResult | null>(null);

  // Load Midtrans Snap script
  useEffect(() => {
    const existingScript = document.getElementById("midtrans-snap");
    if (existingScript) {
      setSnapLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "midtrans-snap";
    script.src = import.meta.env.VITE_MIDTRANS_SNAP_URL || "https://app.sandbox.midtrans.com/snap/snap.js";
    script.setAttribute("data-client-key", import.meta.env.VITE_MIDTRANS_CLIENT_KEY || "");
    script.async = true;
    script.onload = () => setSnapLoaded(true);
    script.onerror = () => {
      toast.error("Failed to load payment gateway");
      setStatus("error");
    };
    document.body.appendChild(script);

    return () => {
      // Don't remove script on unmount to prevent re-loading
    };
  }, []);

  const handlePayment = async () => {
    if (!snapLoaded) {
      toast.error("Payment gateway is still loading");
      return;
    }

    setStatus("loading");

    try {
      // Request snap token from Laravel backend
      const response = await api.createSnapToken({
        invoice_id: invoiceId,
        amount,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        description: description || `Payment for Invoice #${invoiceId}`,
      });

      if (!response.success || !response.data?.snap_token) {
        throw new Error(response.error || "Failed to create payment token");
      }

      const snapToken = response.data.snap_token;

      // Open Midtrans Snap popup
      window.snap.pay(snapToken, {
        onSuccess: (result) => {
          setStatus("success");
          setTransactionResult(result);
          toast.success("Payment successful!");
          onSuccess?.(result);
        },
        onPending: (result) => {
          setStatus("pending");
          setTransactionResult(result);
          toast.info("Payment pending. Please complete your payment.");
          onPending?.(result);
        },
        onError: (result) => {
          setStatus("error");
          setTransactionResult(result);
          toast.error("Payment failed. Please try again.");
          onError?.(result);
        },
        onClose: () => {
          setStatus("idle");
          onClose?.();
        },
      });
    } catch (error) {
      setStatus("error");
      toast.error(error instanceof Error ? error.message : "Payment initialization failed");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStatusIcon = () => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case "pending":
        return <Clock className="h-12 w-12 text-yellow-500" />;
      case "error":
        return <XCircle className="h-12 w-12 text-red-500" />;
      default:
        return <CreditCard className="h-12 w-12 text-primary" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500">Payment Successful</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">Payment Pending</Badge>;
      case "error":
        return <Badge variant="destructive">Payment Failed</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">{getStatusIcon()}</div>
        <CardTitle>
          {status === "success"
            ? "Payment Complete"
            : status === "pending"
            ? "Awaiting Payment"
            : status === "error"
            ? "Payment Failed"
            : "Complete Payment"}
        </CardTitle>
        <CardDescription>
          {status === "idle" || status === "loading"
            ? `Invoice #${invoiceId}`
            : transactionResult?.order_id}
        </CardDescription>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{customerName}</span>
          </div>
          {customerEmail && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{customerEmail}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t pt-2 mt-2">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-bold text-lg">{formatCurrency(amount)}</span>
          </div>
        </div>

        {transactionResult && (status === "success" || status === "pending") && (
          <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-xs">{transactionResult.transaction_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method</span>
              <span className="capitalize">{transactionResult.payment_type?.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span>{transactionResult.transaction_time}</span>
            </div>
          </div>
        )}

        {(status === "idle" || status === "error") && (
          <Button
            onClick={handlePayment}
            disabled={!snapLoaded}
            className="w-full"
            size="lg"
          >
            {!snapLoaded ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : status === "error" ? (
              "Try Again"
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pay Now
              </>
            )}
          </Button>
        )}

        {status === "pending" && (
          <div className="text-center text-sm text-muted-foreground">
            <p>Please complete your payment according to the instructions.</p>
            <p>This page will update automatically once payment is confirmed.</p>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Secured by Midtrans Payment Gateway
        </p>
      </CardContent>
    </Card>
  );
}
