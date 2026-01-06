import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileText, Calendar, User, Package, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { MidtransPayment } from "@/components/payments/MidtransPayment";
import { api } from "@/lib/api";
import { format } from "date-fns";

interface InvoiceDetails {
  id: string;
  amount: number;
  status: string;
  due_date: string;
  created_at: string;
  notes?: string;
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  subscription: {
    id: string;
    start_date: string;
    end_date: string;
    package: {
      id: string;
      name: string;
      bandwidth: string;
      price: number;
    };
  };
}

export default function PaymentPortal() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails();
    }
  }, [invoiceId]);

  const fetchInvoiceDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getPublicInvoice(invoiceId!);
      
      if (response.success && response.data) {
        const invoiceData = response.data as InvoiceDetails;
        setInvoice(invoiceData);
        if (invoiceData.status === "paid") {
          setPaymentComplete(true);
        }
      } else {
        setError(response.error || "Invoice not found");
      }
    } catch (err) {
      setError("Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "overdue":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Invoice Not Found</h2>
            <p className="text-muted-foreground">{error || "The invoice you're looking for doesn't exist or has been removed."}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentComplete || invoice.status === "paid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-semibold">Payment Complete!</h2>
            <p className="text-muted-foreground">
              Thank you for your payment. Your subscription has been activated.
            </p>
            <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono">#{invoice.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatCurrency(invoice.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Package</span>
                <span>{invoice.subscription.package.name}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Payment Portal</h1>
          <p className="text-muted-foreground">Complete your payment securely</p>
        </div>

        {/* Invoice Details Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>Invoice #{invoice.id.slice(0, 8)}</CardTitle>
                  <CardDescription>
                    Created {format(new Date(invoice.created_at), "dd MMM yyyy")}
                  </CardDescription>
                </div>
              </div>
              {getStatusBadge(invoice.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Customer Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                Customer Details
              </div>
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{invoice.customer.name}</span>
                </div>
                {invoice.customer.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{invoice.customer.email}</span>
                  </div>
                )}
                {invoice.customer.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{invoice.customer.phone}</span>
                  </div>
                )}
                {invoice.customer.address && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <span className="text-right max-w-[200px]">{invoice.customer.address}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Package Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4 text-muted-foreground" />
                Package Details
              </div>
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span className="font-medium">{invoice.subscription.package.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bandwidth</span>
                  <span>{invoice.subscription.package.bandwidth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period</span>
                  <span>
                    {format(new Date(invoice.subscription.start_date), "dd MMM")} - {format(new Date(invoice.subscription.end_date), "dd MMM yyyy")}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Payment Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Payment Details
              </div>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className={invoice.status === "overdue" ? "text-destructive font-medium" : ""}>
                    {format(new Date(invoice.due_date), "dd MMM yyyy")}
                  </span>
                </div>
                {invoice.notes && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Notes</span>
                    <span className="text-right max-w-[200px]">{invoice.notes}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Amount</span>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(invoice.amount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Component */}
        <MidtransPayment
          invoiceId={invoice.id}
          amount={invoice.amount}
          customerName={invoice.customer.name}
          customerEmail={invoice.customer.email}
          customerPhone={invoice.customer.phone}
          description={`Payment for ${invoice.subscription.package.name} - Invoice #${invoice.id.slice(0, 8)}`}
          onSuccess={() => {
            setPaymentComplete(true);
            fetchInvoiceDetails();
          }}
          onPending={() => {
            fetchInvoiceDetails();
          }}
        />

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Having issues? Contact our support team for assistance.
        </p>
      </div>
    </div>
  );
}
