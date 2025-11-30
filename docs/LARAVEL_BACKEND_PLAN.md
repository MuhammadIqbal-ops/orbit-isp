# Laravel Backend Plan untuk ISP Billing + MikroTik

## 1. MySQL Database Schema

```sql
-- =============================================
-- DATABASE SCHEMA
-- =============================================

CREATE DATABASE isp_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE isp_billing;

-- Users table (untuk admin)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator') DEFAULT 'operator',
    remember_token VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Packages table
CREATE TABLE packages (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    bandwidth VARCHAR(50) NOT NULL COMMENT 'e.g., 10M/10M',
    burst VARCHAR(100) COMMENT 'e.g., 20M/20M 10M/10M 10/10 5',
    priority TINYINT,
    price DECIMAL(15, 2) NOT NULL,
    type ENUM('pppoe', 'hotspot', 'static') DEFAULT 'pppoe',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE subscriptions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id CHAR(36) NOT NULL,
    package_id CHAR(36) NOT NULL,
    mikrotik_username VARCHAR(255) NOT NULL,
    mikrotik_password VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    auto_renew BOOLEAN DEFAULT TRUE,
    status ENUM('active', 'expired', 'suspended', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT
);

-- Invoices table
CREATE TABLE invoices (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    subscription_id CHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('unpaid', 'paid', 'overdue', 'cancelled') DEFAULT 'unpaid',
    payment_reference VARCHAR(255),
    payment_url VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Payments table
CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    invoice_id CHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    method ENUM('cash', 'transfer', 'qris', 'ewallet', 'other') DEFAULT 'cash',
    transaction_id VARCHAR(255),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Billing logs table
CREATE TABLE billing_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    subscription_id CHAR(36),
    invoice_id CHAR(36),
    action VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    meta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

-- Router settings table
CREATE TABLE router_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    host VARCHAR(255) NOT NULL,
    port INT DEFAULT 8728,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    ssl BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- RADIUS settings table (optional)
CREATE TABLE radius_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    host VARCHAR(255) NOT NULL,
    port INT DEFAULT 1812,
    secret VARCHAR(255) NOT NULL,
    nas_identifier VARCHAR(255) DEFAULT 'mikrotik',
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- MikroTik secrets table (untuk sync)
CREATE TABLE mikrotik_secrets (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id CHAR(36),
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    service ENUM('pppoe', 'hotspot', 'any') DEFAULT 'pppoe',
    profile VARCHAR(255),
    local_address VARCHAR(50),
    remote_address VARCHAR(50),
    comment TEXT,
    disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_mikrotik_secrets_username ON mikrotik_secrets(username);
```

## 2. Laravel Project Structure

```
laravel-isp-billing/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/
│   │   │   │   ├── AuthController.php
│   │   │   │   ├── CustomerController.php
│   │   │   │   ├── PackageController.php
│   │   │   │   ├── SubscriptionController.php
│   │   │   │   ├── InvoiceController.php
│   │   │   │   ├── PaymentController.php
│   │   │   │   ├── RouterSettingController.php
│   │   │   │   └── MikrotikController.php
│   │   │   └── Controller.php
│   │   ├── Middleware/
│   │   │   └── Cors.php
│   │   └── Resources/
│   │       ├── CustomerResource.php
│   │       ├── PackageResource.php
│   │       └── ...
│   ├── Models/
│   │   ├── User.php
│   │   ├── Customer.php
│   │   ├── Package.php
│   │   ├── Subscription.php
│   │   ├── Invoice.php
│   │   ├── Payment.php
│   │   ├── RouterSetting.php
│   │   └── MikrotikSecret.php
│   └── Services/
│       └── MikrotikService.php
├── config/
├── database/
│   └── migrations/
├── routes/
│   └── api.php
└── ...
```

## 3. API Routes (routes/api.php)

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\PackageController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\RouterSettingController;
use App\Http\Controllers\Api\MikrotikController;

// Public routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // Customers
    Route::apiResource('customers', CustomerController::class);

    // Packages
    Route::apiResource('packages', PackageController::class);
    Route::post('/packages/{id}/sync-mikrotik', [PackageController::class, 'syncMikrotik']);

    // Subscriptions
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('/subscriptions/{id}/create-mikrotik-user', [SubscriptionController::class, 'createMikrotikUser']);

    // Invoices
    Route::apiResource('invoices', InvoiceController::class);

    // Payments
    Route::apiResource('payments', PaymentController::class);

    // Router Settings
    Route::get('/router-settings', [RouterSettingController::class, 'index']);
    Route::post('/router-settings', [RouterSettingController::class, 'store']);
    Route::put('/router-settings/{id}', [RouterSettingController::class, 'update']);

    // MikroTik Operations
    Route::prefix('mikrotik')->group(function () {
        Route::get('/system', [MikrotikController::class, 'system']);
        Route::get('/traffic', [MikrotikController::class, 'traffic']);
        Route::get('/online-users', [MikrotikController::class, 'onlineUsers']);
        Route::get('/user-detail/{username}', [MikrotikController::class, 'userDetail']);
        Route::post('/toggle-user', [MikrotikController::class, 'toggleUser']);
        Route::post('/disconnect-user', [MikrotikController::class, 'disconnectUser']);
        Route::post('/import-secrets', [MikrotikController::class, 'importSecrets']);
        Route::post('/sync-secret', [MikrotikController::class, 'syncSecret']);
    });

    // MikroTik Secrets
    Route::apiResource('mikrotik-secrets', MikrotikSecretController::class);
});
```

## 4. MikroTik Service (app/Services/MikrotikService.php)

```php
<?php

namespace App\Services;

use App\Models\RouterSetting;
use RouterOS\Client;
use RouterOS\Query;

class MikrotikService
{
    protected $client;
    protected $settings;

    public function __construct()
    {
        $this->settings = RouterSetting::first();
    }

    /**
     * Connect to MikroTik Router
     */
    public function connect(): bool
    {
        if (!$this->settings) {
            throw new \Exception('Router settings not configured');
        }

        try {
            $this->client = new Client([
                'host' => $this->settings->host,
                'port' => $this->settings->port,
                'user' => $this->settings->username,
                'pass' => $this->settings->password,
                'legacy' => true, // For RouterOS v6
            ]);
            return true;
        } catch (\Exception $e) {
            throw new \Exception('Failed to connect to MikroTik: ' . $e->getMessage());
        }
    }

    /**
     * Get system resource info
     */
    public function getSystemResource(): array
    {
        $this->connect();
        
        $query = new Query('/system/resource/print');
        $response = $this->client->query($query)->read();
        
        if (empty($response)) {
            return [];
        }

        $data = $response[0];
        
        return [
            'cpu' => (int) ($data['cpu-load'] ?? 0),
            'memory' => $this->calculateMemoryPercent($data),
            'uptime' => $data['uptime'] ?? '0s',
            'version' => $data['version'] ?? 'Unknown',
            'board' => $data['board-name'] ?? 'Unknown',
            'temperature' => $this->parseTemperature($data),
        ];
    }

    /**
     * Get online PPPoE/Hotspot users
     */
    public function getOnlineUsers(): array
    {
        $this->connect();
        
        $users = [];

        // Get PPPoE active sessions
        $pppoeQuery = new Query('/ppp/active/print');
        $pppoeUsers = $this->client->query($pppoeQuery)->read();
        
        foreach ($pppoeUsers as $user) {
            $users[] = [
                'id' => $user['.id'] ?? '',
                'name' => $user['name'] ?? '',
                'type' => 'pppoe',
                'address' => $user['address'] ?? '',
                'uptime' => $user['uptime'] ?? '0s',
                'caller_id' => $user['caller-id'] ?? '',
                'service' => $user['service'] ?? '',
            ];
        }

        // Get Hotspot active sessions
        $hotspotQuery = new Query('/ip/hotspot/active/print');
        $hotspotUsers = $this->client->query($hotspotQuery)->read();
        
        foreach ($hotspotUsers as $user) {
            $users[] = [
                'id' => $user['.id'] ?? '',
                'name' => $user['user'] ?? '',
                'type' => 'hotspot',
                'address' => $user['address'] ?? '',
                'uptime' => $user['uptime'] ?? '0s',
                'mac_address' => $user['mac-address'] ?? '',
            ];
        }

        return $users;
    }

    /**
     * Get user details
     */
    public function getUserDetail(string $username, string $type = 'pppoe'): ?array
    {
        $this->connect();

        if ($type === 'pppoe') {
            $query = (new Query('/ppp/active/print'))
                ->where('name', $username);
            $users = $this->client->query($query)->read();
            
            if (!empty($users)) {
                return $users[0];
            }
        } else {
            $query = (new Query('/ip/hotspot/active/print'))
                ->where('user', $username);
            $users = $this->client->query($query)->read();
            
            if (!empty($users)) {
                return $users[0];
            }
        }

        return null;
    }

    /**
     * Toggle user (enable/disable)
     */
    public function toggleUser(string $username, bool $enable): bool
    {
        $this->connect();

        // Try PPPoE secret first
        $query = (new Query('/ppp/secret/print'))
            ->where('name', $username);
        $secrets = $this->client->query($query)->read();

        if (!empty($secrets)) {
            $setQuery = (new Query('/ppp/secret/set'))
                ->equal('.id', $secrets[0]['.id'])
                ->equal('disabled', $enable ? 'no' : 'yes');
            $this->client->query($setQuery)->read();
            return true;
        }

        // Try Hotspot user
        $query = (new Query('/ip/hotspot/user/print'))
            ->where('name', $username);
        $users = $this->client->query($query)->read();

        if (!empty($users)) {
            $setQuery = (new Query('/ip/hotspot/user/set'))
                ->equal('.id', $users[0]['.id'])
                ->equal('disabled', $enable ? 'no' : 'yes');
            $this->client->query($setQuery)->read();
            return true;
        }

        return false;
    }

    /**
     * Disconnect active user
     */
    public function disconnectUser(string $username): bool
    {
        $this->connect();

        // Try PPPoE active
        $query = (new Query('/ppp/active/print'))
            ->where('name', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ppp/active/remove'))
                ->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            return true;
        }

        // Try Hotspot active
        $query = (new Query('/ip/hotspot/active/print'))
            ->where('user', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ip/hotspot/active/remove'))
                ->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            return true;
        }

        return false;
    }

    /**
     * Create PPPoE/Hotspot user
     */
    public function createUser(string $username, string $password, string $profile, string $service = 'pppoe'): bool
    {
        $this->connect();

        if ($service === 'pppoe') {
            $query = (new Query('/ppp/secret/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('service', 'pppoe')
                ->equal('profile', $profile);
        } else {
            $query = (new Query('/ip/hotspot/user/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('profile', $profile);
        }

        $this->client->query($query)->read();
        return true;
    }

    /**
     * Update PPPoE/Hotspot user
     */
    public function updateUser(string $username, array $data, string $service = 'pppoe'): bool
    {
        $this->connect();

        if ($service === 'pppoe') {
            $query = (new Query('/ppp/secret/print'))
                ->where('name', $username);
            $secrets = $this->client->query($query)->read();

            if (!empty($secrets)) {
                $setQuery = new Query('/ppp/secret/set');
                $setQuery->equal('.id', $secrets[0]['.id']);
                
                foreach ($data as $key => $value) {
                    $setQuery->equal($key, $value);
                }
                
                $this->client->query($setQuery)->read();
                return true;
            }
        } else {
            $query = (new Query('/ip/hotspot/user/print'))
                ->where('name', $username);
            $users = $this->client->query($query)->read();

            if (!empty($users)) {
                $setQuery = new Query('/ip/hotspot/user/set');
                $setQuery->equal('.id', $users[0]['.id']);
                
                foreach ($data as $key => $value) {
                    $setQuery->equal($key, $value);
                }
                
                $this->client->query($setQuery)->read();
                return true;
            }
        }

        return false;
    }

    /**
     * Delete PPPoE/Hotspot user
     */
    public function deleteUser(string $username, string $service = 'pppoe'): bool
    {
        $this->connect();

        if ($service === 'pppoe') {
            $query = (new Query('/ppp/secret/print'))
                ->where('name', $username);
            $secrets = $this->client->query($query)->read();

            if (!empty($secrets)) {
                $removeQuery = (new Query('/ppp/secret/remove'))
                    ->equal('.id', $secrets[0]['.id']);
                $this->client->query($removeQuery)->read();
                return true;
            }
        } else {
            $query = (new Query('/ip/hotspot/user/print'))
                ->where('name', $username);
            $users = $this->client->query($query)->read();

            if (!empty($users)) {
                $removeQuery = (new Query('/ip/hotspot/user/remove'))
                    ->equal('.id', $users[0]['.id']);
                $this->client->query($removeQuery)->read();
                return true;
            }
        }

        return false;
    }

    /**
     * Import all PPPoE secrets from MikroTik
     */
    public function importSecrets(): array
    {
        $this->connect();

        $query = new Query('/ppp/secret/print');
        $secrets = $this->client->query($query)->read();

        return array_map(function ($secret) {
            return [
                'username' => $secret['name'] ?? '',
                'password' => $secret['password'] ?? '',
                'service' => $secret['service'] ?? 'pppoe',
                'profile' => $secret['profile'] ?? '',
                'local_address' => $secret['local-address'] ?? '',
                'remote_address' => $secret['remote-address'] ?? '',
                'comment' => $secret['comment'] ?? '',
                'disabled' => ($secret['disabled'] ?? 'false') === 'true',
            ];
        }, $secrets);
    }

    /**
     * Get traffic data from interface
     */
    public function getTraffic(): array
    {
        $this->connect();

        $query = new Query('/interface/print');
        $interfaces = $this->client->query($query)->read();

        $traffic = [];
        foreach ($interfaces as $iface) {
            if (isset($iface['type']) && in_array($iface['type'], ['ether', 'pppoe-out', 'vlan'])) {
                $traffic[] = [
                    'name' => $iface['name'] ?? '',
                    'rx_bytes' => (int) ($iface['rx-byte'] ?? 0),
                    'tx_bytes' => (int) ($iface['tx-byte'] ?? 0),
                    'running' => ($iface['running'] ?? 'false') === 'true',
                ];
            }
        }

        return $traffic;
    }

    /**
     * Create or update PPP profile (for package sync)
     */
    public function syncProfile(string $name, string $rateLimit): bool
    {
        $this->connect();

        $profileName = 'profile-' . strtolower(str_replace(' ', '-', $name));

        $query = (new Query('/ppp/profile/print'))
            ->where('name', $profileName);
        $profiles = $this->client->query($query)->read();

        if (!empty($profiles)) {
            // Update existing
            $setQuery = (new Query('/ppp/profile/set'))
                ->equal('.id', $profiles[0]['.id'])
                ->equal('rate-limit', $rateLimit);
            $this->client->query($setQuery)->read();
        } else {
            // Create new
            $addQuery = (new Query('/ppp/profile/add'))
                ->equal('name', $profileName)
                ->equal('rate-limit', $rateLimit)
                ->equal('local-address', 'default')
                ->equal('remote-address', 'default');
            $this->client->query($addQuery)->read();
        }

        return true;
    }

    // Helper methods
    private function calculateMemoryPercent(array $data): int
    {
        $total = (int) ($data['total-memory'] ?? 1);
        $free = (int) ($data['free-memory'] ?? 0);
        return (int) ((($total - $free) / $total) * 100);
    }

    private function parseTemperature(array $data): ?int
    {
        if (isset($data['cpu-temperature'])) {
            return (int) preg_replace('/[^0-9]/', '', $data['cpu-temperature']);
        }
        return null;
    }
}
```

## 5. MikroTik Controller (app/Http/Controllers/Api/MikrotikController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MikrotikService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class MikrotikController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;
    }

    public function system(): JsonResponse
    {
        try {
            $data = $this->mikrotik->getSystemResource();
            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function onlineUsers(): JsonResponse
    {
        try {
            $users = $this->mikrotik->getOnlineUsers();
            return response()->json($users);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function userDetail(string $username, Request $request): JsonResponse
    {
        try {
            $type = $request->get('type', 'pppoe');
            $user = $this->mikrotik->getUserDetail($username, $type);
            
            if (!$user) {
                return response()->json(['error' => 'User not found'], 404);
            }
            
            return response()->json($user);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function toggleUser(Request $request): JsonResponse
    {
        $request->validate([
            'username' => 'required|string',
            'enable' => 'required|boolean',
        ]);

        try {
            $result = $this->mikrotik->toggleUser(
                $request->username,
                $request->enable
            );
            
            return response()->json(['success' => $result]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function disconnectUser(Request $request): JsonResponse
    {
        $request->validate([
            'username' => 'required|string',
        ]);

        try {
            $result = $this->mikrotik->disconnectUser($request->username);
            return response()->json(['success' => $result]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function importSecrets(): JsonResponse
    {
        try {
            $secrets = $this->mikrotik->importSecrets();
            
            $imported = 0;
            foreach ($secrets as $secret) {
                \App\Models\MikrotikSecret::updateOrCreate(
                    ['username' => $secret['username']],
                    $secret
                );
                $imported++;
            }
            
            return response()->json([
                'success' => true,
                'imported' => $imported,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function syncSecret(Request $request): JsonResponse
    {
        $request->validate([
            'action' => 'required|in:create,update,delete',
            'secret_id' => 'required|uuid',
        ]);

        try {
            $secret = \App\Models\MikrotikSecret::findOrFail($request->secret_id);
            
            switch ($request->action) {
                case 'create':
                    $this->mikrotik->createUser(
                        $secret->username,
                        $secret->password,
                        $secret->profile ?? 'default',
                        $secret->service
                    );
                    break;
                case 'update':
                    $this->mikrotik->updateUser(
                        $secret->username,
                        [
                            'password' => $secret->password,
                            'profile' => $secret->profile ?? 'default',
                            'disabled' => $secret->disabled ? 'yes' : 'no',
                        ],
                        $secret->service
                    );
                    break;
                case 'delete':
                    $this->mikrotik->deleteUser($secret->username, $secret->service);
                    break;
            }
            
            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function traffic(): JsonResponse
    {
        try {
            $traffic = $this->mikrotik->getTraffic();
            return response()->json($traffic);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
```

## 6. Installation Steps

### 1. Create Laravel Project
```bash
composer create-project laravel/laravel laravel-isp-billing
cd laravel-isp-billing
```

### 2. Install Required Packages
```bash
# RouterOS API client
composer require evilfreelancer/routeros-api-php

# Laravel Sanctum for API auth
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"

# CORS handling
composer require fruitcake/laravel-cors
```

### 3. Configure .env
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=your_username
DB_PASSWORD=your_password

SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173,your-frontend-domain.com
```

### 4. Run Migrations
```bash
php artisan migrate
```

### 5. Configure CORS (config/cors.php)
```php
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['*'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

## 7. Frontend Integration

Update frontend API calls to point to Laravel backend:

```typescript
// src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  
  return response.json();
}

// Example usage:
// apiCall('/mikrotik/online-users')
// apiCall('/customers', { method: 'POST', body: JSON.stringify(data) })
```

## 8. Endpoint Mapping (Supabase → Laravel)

| Supabase Edge Function | Laravel Endpoint |
|------------------------|------------------|
| `mikrotik-system` | `GET /api/mikrotik/system` |
| `mikrotik-online-users` | `GET /api/mikrotik/online-users` |
| `mikrotik-user-detail` | `GET /api/mikrotik/user-detail/{username}` |
| `mikrotik-toggle-user` | `POST /api/mikrotik/toggle-user` |
| `mikrotik-disconnect-user` | `POST /api/mikrotik/disconnect-user` |
| `mikrotik-import-secrets` | `POST /api/mikrotik/import-secrets` |
| `mikrotik-sync-secret` | `POST /api/mikrotik/sync-secret` |
| `mikrotik-traffic` | `GET /api/mikrotik/traffic` |
| `mikrotik-sync-package` | `POST /api/packages/{id}/sync-mikrotik` |
| `mikrotik-create-user` | `POST /api/subscriptions/{id}/create-mikrotik-user` |

---

## Notes

- Library `evilfreelancer/routeros-api-php` mendukung RouterOS v6 dan v7
- Set `'legacy' => true` di config client untuk RouterOS v6
- Gunakan Laravel Sanctum untuk API authentication
- Bisa dikembangkan dengan Laravel Reverb/Pusher untuk realtime monitoring
