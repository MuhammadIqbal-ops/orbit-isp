/**
 * Supabase API Client
 * 
 * This file handles all communication with Supabase backend.
 * Uses Supabase client for database operations and Edge Functions for complex operations.
 */

import { supabase } from "@/integrations/supabase/client";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Connection test function
export async function testApiConnection(): Promise<{
  connected: boolean;
  url: string;
  message: string;
  latency?: number;
}> {
  const startTime = Date.now();
  try {
    const { data, error } = await supabase.from('customers').select('id').limit(1);
    const latency = Date.now() - startTime;
    
    if (error) {
      return {
        connected: false,
        url: 'Supabase',
        message: error.message,
      };
    }
    
    return {
      connected: true,
      url: 'Supabase',
      message: `Connected to backend (${latency}ms)`,
      latency,
    };
  } catch (error: any) {
    return {
      connected: false,
      url: 'Supabase',
      message: error.message || 'Failed to connect to backend',
    };
  }
}

class ApiClient {
  private static instance: ApiClient;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // Helper to wrap Supabase responses
  private wrapResponse<T>(data: T | null, error: any): ApiResponse<T> {
    if (error) {
      console.error('Supabase Error:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data: data as T };
  }

  // Helper to call edge functions
  private async callEdgeFunction<T>(functionName: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: body || {},
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error(`Edge Function Error [${functionName}]:`, error);
      return { success: false, error: error.message };
    }
  }

  // ==================== AUTH ====================
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { user: data.user, session: data.session } };
  }

  async register(name: string, email: string, password: string, _password_confirmation: string) {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { user: data.user, session: data.session } };
  }

  async logout() {
    const { error } = await supabase.auth.signOut();
    return this.wrapResponse(null, error);
  }

  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return { success: false, error: error?.message || 'Not authenticated' };
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email?.split('@')[0],
          role: roleData?.role || 'user',
          created_at: user.created_at,
        },
      },
    };
  }

  // ==================== DASHBOARD ====================
  async getDashboardStats() {
    const [customers, packages, subscriptions, invoices] = await Promise.all([
      supabase.from('customers').select('id, status', { count: 'exact' }),
      supabase.from('packages').select('id', { count: 'exact' }),
      supabase.from('subscriptions').select('id, status', { count: 'exact' }),
      supabase.from('invoices').select('id, amount, status', { count: 'exact' }),
    ]);

    const activeSubscriptions = subscriptions.data?.filter(s => s.status === 'active').length || 0;
    const unpaidInvoices = invoices.data?.filter(i => i.status === 'unpaid') || [];
    const totalRevenue = invoices.data?.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.amount), 0) || 0;

    return {
      success: true,
      data: {
        total_customers: customers.count || 0,
        active_customers: customers.data?.filter(c => c.status === 'active').length || 0,
        total_packages: packages.count || 0,
        active_subscriptions: activeSubscriptions,
        pending_invoices: unpaidInvoices.length,
        total_revenue: totalRevenue,
      },
    };
  }

  // ==================== CUSTOMERS ====================
  async getCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    return this.wrapResponse(data, error);
  }

  async getCustomer(id: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createCustomer(customerData: any) {
    const { data, error } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async updateCustomer(id: string, customerData: any) {
    const { data, error } = await supabase
      .from('customers')
      .update(customerData)
      .eq('id', id)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async deleteCustomer(id: string) {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    return this.wrapResponse(null, error);
  }

  // ==================== PACKAGES ====================
  async getPackages() {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .order('price', { ascending: true });
    return this.wrapResponse(data, error);
  }

  async getPackage(id: string) {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createPackage(packageData: any) {
    const { data, error } = await supabase
      .from('packages')
      .insert(packageData)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async updatePackage(id: string, packageData: any) {
    const { data, error } = await supabase
      .from('packages')
      .update(packageData)
      .eq('id', id)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async deletePackage(id: string) {
    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', id);
    return this.wrapResponse(null, error);
  }

  // ==================== SUBSCRIPTIONS ====================
  async getSubscriptions() {
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        customer:customers(id, name, email, phone),
        package:packages(id, name, bandwidth, price)
      `)
      .order('created_at', { ascending: false });
    return this.wrapResponse(data, error);
  }

  async getSubscription(id: string) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        customer:customers(id, name, email, phone),
        package:packages(id, name, bandwidth, price)
      `)
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createSubscription(subscriptionData: any) {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async updateSubscription(id: string, subscriptionData: any) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update(subscriptionData)
      .eq('id', id)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async deleteSubscription(id: string) {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id);
    return this.wrapResponse(null, error);
  }

  // ==================== INVOICES ====================
  async getInvoices() {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        subscription:subscriptions(
          id,
          mikrotik_username,
          customer:customers(id, name, email, phone),
          package:packages(id, name, price)
        )
      `)
      .order('created_at', { ascending: false });
    return this.wrapResponse(data, error);
  }

  async getInvoice(id: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        subscription:subscriptions(
          id,
          mikrotik_username,
          customer:customers(id, name, email, phone),
          package:packages(id, name, price, bandwidth)
        )
      `)
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createInvoice(invoiceData: any) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async updateInvoice(id: string, invoiceData: any) {
    const { data, error } = await supabase
      .from('invoices')
      .update(invoiceData)
      .eq('id', id)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async deleteInvoice(id: string) {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);
    return this.wrapResponse(null, error);
  }

  // Public invoice endpoint (no auth required) - uses edge function
  async getPublicInvoice(id: string) {
    return this.callEdgeFunction('public-invoice', { invoice_id: id });
  }

  // ==================== PAYMENTS ====================
  async getPayments() {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        invoice:invoices(
          id,
          amount,
          status,
          subscription:subscriptions(
            customer:customers(id, name)
          )
        )
      `)
      .order('payment_date', { ascending: false });
    return this.wrapResponse(data, error);
  }

  async getPayment(id: string) {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        invoice:invoices(*)
      `)
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createPayment(paymentData: any) {
    const { data, error } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single();
    
    if (!error && data) {
      // Update invoice status to paid
      await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', paymentData.invoice_id);
    }
    
    return this.wrapResponse(data, error);
  }

  // ==================== ROUTER SETTINGS ====================
  async getRouterSettings() {
    const { data, error } = await supabase
      .from('router_settings')
      .select('*')
      .limit(1)
      .single();
    return this.wrapResponse(data, error);
  }

  async saveRouterSettings(settingsData: any) {
    // Check if settings exist
    const { data: existing } = await supabase
      .from('router_settings')
      .select('id')
      .limit(1)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('router_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();
      return this.wrapResponse(data, error);
    } else {
      const { data, error } = await supabase
        .from('router_settings')
        .insert(settingsData)
        .select()
        .single();
      return this.wrapResponse(data, error);
    }
  }

  async testRouterConnection() {
    return this.callEdgeFunction('mikrotik', { action: 'test-connection' });
  }

  // ==================== RADIUS SETTINGS ====================
  async getRadiusSettings() {
    const { data, error } = await supabase
      .from('radius_settings')
      .select('*')
      .limit(1)
      .single();
    return this.wrapResponse(data, error);
  }

  async saveRadiusSettings(settingsData: any) {
    const { data: existing } = await supabase
      .from('radius_settings')
      .select('id')
      .limit(1)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('radius_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();
      return this.wrapResponse(data, error);
    } else {
      const { data, error } = await supabase
        .from('radius_settings')
        .insert(settingsData)
        .select()
        .single();
      return this.wrapResponse(data, error);
    }
  }

  // ==================== MIKROTIK OPERATIONS (via Edge Function) ====================
  async getMikrotikSystem() {
    return this.callEdgeFunction('mikrotik', { action: 'get-system' });
  }

  async getMikrotikTraffic() {
    return this.callEdgeFunction('mikrotik', { action: 'get-traffic' });
  }

  async getMikrotikOnlineUsers() {
    return this.callEdgeFunction('mikrotik', { action: 'get-online-users' });
  }

  async getMikrotikUserDetail(username: string, type: string) {
    return this.callEdgeFunction('mikrotik', { action: 'get-user-detail', username, type });
  }

  async toggleMikrotikUser(username: string, type: string, action: 'enable' | 'disable') {
    return this.callEdgeFunction('mikrotik', { action: 'toggle-user', username, type, toggle: action });
  }

  async disconnectMikrotikUser(username: string, type: string) {
    return this.callEdgeFunction('mikrotik', { action: 'disconnect-user', username, type });
  }

  async createMikrotikUser(data: any) {
    return this.callEdgeFunction('mikrotik', { action: 'create-user', ...data });
  }

  async updateMikrotikUser(data: any) {
    return this.callEdgeFunction('mikrotik', { action: 'update-user', ...data });
  }

  async deleteMikrotikUser(username: string, type: string) {
    return this.callEdgeFunction('mikrotik', { action: 'delete-user', username, type });
  }

  // Secrets Management (stored in Supabase, synced via Edge Function)
  async getMikrotikSecrets() {
    const { data, error } = await supabase
      .from('mikrotik_secrets')
      .select(`
        *,
        customer:customers(id, name)
      `)
      .order('created_at', { ascending: false });
    return this.wrapResponse(data, error);
  }

  async getMikrotikSecret(id: string) {
    const { data, error } = await supabase
      .from('mikrotik_secrets')
      .select('*')
      .eq('id', id)
      .single();
    return this.wrapResponse(data, error);
  }

  async createMikrotikSecret(secretData: any) {
    const { data, error } = await supabase
      .from('mikrotik_secrets')
      .insert(secretData)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async updateMikrotikSecret(id: string, secretData: any) {
    const { data, error } = await supabase
      .from('mikrotik_secrets')
      .update(secretData)
      .eq('id', id)
      .select()
      .single();
    return this.wrapResponse(data, error);
  }

  async deleteMikrotikSecret(id: string) {
    const { error } = await supabase
      .from('mikrotik_secrets')
      .delete()
      .eq('id', id);
    return this.wrapResponse(null, error);
  }

  async syncMikrotikSecret(id: string, action: 'create' | 'update' | 'delete') {
    return this.callEdgeFunction('mikrotik', { action: 'sync-secret', secretId: id, syncAction: action });
  }

  async importMikrotikSecrets() {
    return this.callEdgeFunction('mikrotik', { action: 'import-secrets' });
  }

  async syncPackageToMikrotik(packageId: string) {
    return this.callEdgeFunction('mikrotik', { action: 'sync-package', packageId });
  }

  // ==================== BILLING LOGS ====================
  async getBillingLogs(limit: number = 50) {
    const { data, error } = await supabase
      .from('billing_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return this.wrapResponse(data, error);
  }

  // ==================== MIDTRANS PAYMENT (via Edge Function) ====================
  async createSnapToken(data: {
    invoice_id: string;
    amount: number;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    description?: string;
  }) {
    return this.callEdgeFunction<{ snap_token: string; order_id: string }>('midtrans', {
      action: 'create-snap-token',
      ...data,
    });
  }
}

export const api = ApiClient.getInstance();
export default api;
