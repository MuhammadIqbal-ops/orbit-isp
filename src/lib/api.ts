/**
 * Laravel API Client
 * 
 * This file handles all communication with the Laravel backend.
 * Replace VITE_API_URL in .env with your Laravel API URL.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Debug: Log API URL on initialization
console.log('🔗 API URL:', API_URL);

// Connection test function
export async function testApiConnection(): Promise<{
  connected: boolean;
  url: string;
  message: string;
  latency?: number;
}> {
  const startTime = Date.now();
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      return {
        connected: true,
        url: API_URL,
        message: `Connected to Laravel backend (${latency}ms)`,
        latency,
      };
    }
    return {
      connected: false,
      url: API_URL,
      message: `Server responded with status ${response.status}`,
    };
  } catch (error: any) {
    return {
      connected: false,
      url: API_URL,
      message: error.message || 'Failed to connect to backend',
    };
  }
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Request failed');
      }

      return { success: true, data };
    } catch (error: any) {
      console.error(`API Error [${endpoint}]:`, error);
      return {
        success: false,
        error: error.message || 'An error occurred',
      };
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  // ==================== AUTH ====================
  async login(email: string, password: string) {
    const response = await this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async register(name: string, email: string, password: string, password_confirmation: string) {
    const response = await this.request<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, password_confirmation }),
    });

    if (response.success && response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async logout() {
    const response = await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
    return response;
  }

  async getUser() {
    return this.request<{ user: any }>('/auth/user');
  }

  // ==================== DASHBOARD ====================
  async getDashboardStats() {
    return this.request('/dashboard/stats');
  }

  // ==================== CUSTOMERS ====================
  async getCustomers() {
    return this.request('/customers');
  }

  async getCustomer(id: string) {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data: any) {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: string, data: any) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomer(id: string) {
    return this.request(`/customers/${id}`, { method: 'DELETE' });
  }

  // ==================== PACKAGES ====================
  async getPackages() {
    return this.request('/packages');
  }

  async getPackage(id: string) {
    return this.request(`/packages/${id}`);
  }

  async createPackage(data: any) {
    return this.request('/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePackage(id: string, data: any) {
    return this.request(`/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePackage(id: string) {
    return this.request(`/packages/${id}`, { method: 'DELETE' });
  }

  // ==================== SUBSCRIPTIONS ====================
  async getSubscriptions() {
    return this.request('/subscriptions');
  }

  async getSubscription(id: string) {
    return this.request(`/subscriptions/${id}`);
  }

  async createSubscription(data: any) {
    return this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubscription(id: string, data: any) {
    return this.request(`/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSubscription(id: string) {
    return this.request(`/subscriptions/${id}`, { method: 'DELETE' });
  }

  // ==================== INVOICES ====================
  async getInvoices() {
    return this.request('/invoices');
  }

  async getInvoice(id: string) {
    return this.request(`/invoices/${id}`);
  }

  async createInvoice(data: any) {
    return this.request('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInvoice(id: string, data: any) {
    return this.request(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInvoice(id: string) {
    return this.request(`/invoices/${id}`, { method: 'DELETE' });
  }

  // ==================== PAYMENTS ====================
  async getPayments() {
    return this.request('/payments');
  }

  async getPayment(id: string) {
    return this.request(`/payments/${id}`);
  }

  async createPayment(data: any) {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== ROUTER SETTINGS ====================
  async getRouterSettings() {
    return this.request('/router-settings');
  }

  async saveRouterSettings(data: any) {
    return this.request('/router-settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testRouterConnection() {
    return this.request('/router-settings/test');
  }

  // ==================== RADIUS SETTINGS ====================
  async getRadiusSettings() {
    return this.request('/radius-settings');
  }

  async saveRadiusSettings(data: any) {
    return this.request('/radius-settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== MIKROTIK OPERATIONS ====================

  // System & Monitoring
  async getMikrotikSystem() {
    return this.request('/mikrotik/system');
  }

  async getMikrotikTraffic() {
    return this.request('/mikrotik/traffic');
  }

  async getMikrotikOnlineUsers() {
    return this.request('/mikrotik/online-users');
  }

  async getMikrotikUserDetail(username: string, type: string) {
    return this.request(`/mikrotik/user-detail?username=${encodeURIComponent(username)}&type=${encodeURIComponent(type)}`);
  }

  // User Management
  async toggleMikrotikUser(username: string, type: string, action: 'enable' | 'disable') {
    return this.request('/mikrotik/toggle-user', {
      method: 'POST',
      body: JSON.stringify({ username, type, action }),
    });
  }

  async disconnectMikrotikUser(username: string, type: string) {
    return this.request('/mikrotik/disconnect-user', {
      method: 'POST',
      body: JSON.stringify({ username, type }),
    });
  }

  async createMikrotikUser(data: any) {
    return this.request('/mikrotik/create-user', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMikrotikUser(data: any) {
    return this.request('/mikrotik/update-user', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMikrotikUser(username: string, type: string) {
    return this.request('/mikrotik/delete-user', {
      method: 'DELETE',
      body: JSON.stringify({ username, type }),
    });
  }

  // Secrets Management
  async getMikrotikSecrets() {
    return this.request('/mikrotik-secrets');
  }

  async getMikrotikSecret(id: string) {
    return this.request(`/mikrotik-secrets/${id}`);
  }

  async createMikrotikSecret(data: any) {
    return this.request('/mikrotik-secrets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMikrotikSecret(id: string, data: any) {
    return this.request(`/mikrotik-secrets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMikrotikSecret(id: string) {
    return this.request(`/mikrotik-secrets/${id}`, {
      method: 'DELETE',
    });
  }

  async syncMikrotikSecret(id: string, action: 'create' | 'update' | 'delete') {
    return this.request('/mikrotik/sync-secret', {
      method: 'POST',
      body: JSON.stringify({ secretId: id, action }),
    });
  }

  async importMikrotikSecrets() {
    return this.request('/mikrotik/import-secrets', {
      method: 'POST',
    });
  }

  // Package Sync
  async syncPackageToMikrotik(packageId: string) {
    return this.request('/mikrotik/sync-package', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
  }

  // ==================== SNMP MONITORING ====================
  async getSnmpDevices() {
    return this.request('/snmp-devices');
  }

  async getSnmpDevice(id: string) {
    return this.request(`/snmp-devices/${id}`);
  }

  async createSnmpDevice(data: any) {
    return this.request('/snmp-devices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSnmpDevice(id: string, data: any) {
    return this.request(`/snmp-devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSnmpDevice(id: string) {
    return this.request(`/snmp-devices/${id}`, { method: 'DELETE' });
  }

  async discoverSnmpDevice(id: string) {
    return this.request(`/snmp-devices/${id}/discover`, {
      method: 'POST',
    });
  }

  async getSnmpDeviceInterfaces(id: string) {
    return this.request(`/snmp-devices/${id}/interfaces`);
  }

  async getSnmpBandwidthHistory(interfaceId: string, period: string = '24h') {
    return this.request(`/snmp/bandwidth-history/${interfaceId}?period=${period}`);
  }

  // ==================== PING MONITORING ====================
  async getPingTargets() {
    return this.request('/ping-targets');
  }

  async getPingTarget(id: string) {
    return this.request(`/ping-targets/${id}`);
  }

  async createPingTarget(data: any) {
    return this.request('/ping-targets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePingTarget(id: string, data: any) {
    return this.request(`/ping-targets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePingTarget(id: string) {
    return this.request(`/ping-targets/${id}`, { method: 'DELETE' });
  }

  async getPingHistory(targetId: string, period: string = '24h') {
    return this.request(`/ping-targets/${targetId}/history?period=${period}`);
  }

  // ==================== MONITORING DASHBOARD ====================
  async getMonitoringDashboard() {
    return this.request('/monitoring/dashboard');
  }

  async getAlertLogs(limit: number = 50) {
    return this.request(`/monitoring/alerts?limit=${limit}`);
  }

  // ==================== NOTIFICATION SETTINGS ====================
  async getNotificationSettings() {
    return this.request('/notification-settings');
  }

  async saveNotificationSettings(data: any) {
    return this.request('/notification-settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testNotification(type: 'telegram' | 'email') {
    return this.request('/notification-settings/test', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  }

  // ==================== MIDTRANS PAYMENT ====================
  async createSnapToken(data: {
    invoice_id: string;
    amount: number;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    description?: string;
  }) {
    return this.request<{ snap_token: string; order_id: string }>('/midtrans/snap-token', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
export default api;
