# Laravel 11/12 Backend Plan untuk ISP Billing + MikroTik + SNMP Monitoring

## Overview

Backend Laravel ini mencakup:
1. **ISP Billing System** - Customers, Packages, Subscriptions, Invoices, Payments
2. **MikroTik Integration** - PPPoE/Hotspot user management via RouterOS API
3. **SNMP Monitoring (SMon-style)** - Bandwidth monitoring, ping monitoring, multi-vendor support

---

## 1. MySQL Database Schema

```sql
-- =============================================
-- ISP BILLING TABLES
-- =============================================

CREATE DATABASE isp_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE isp_billing;

-- Users table (untuk admin)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator', 'viewer') DEFAULT 'operator',
    email_verified_at TIMESTAMP NULL,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
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
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT,
    INDEX idx_customer (customer_id),
    INDEX idx_status (status),
    INDEX idx_end_date (end_date)
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
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
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

-- Router settings table (MikroTik)
CREATE TABLE router_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) DEFAULT 'Main Router',
    host VARCHAR(255) NOT NULL,
    port INT DEFAULT 8728,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    ssl BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- MikroTik secrets table
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    INDEX idx_username (username)
);

-- =============================================
-- SNMP MONITORING TABLES (SMon-style)
-- =============================================

-- SNMP Devices table
CREATE TABLE snmp_devices (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    snmp_version ENUM('1', '2c', '3') DEFAULT '2c',
    community VARCHAR(255) DEFAULT 'public',
    -- SNMPv3 fields
    security_level ENUM('noAuthNoPriv', 'authNoPriv', 'authPriv') NULL,
    auth_protocol ENUM('MD5', 'SHA') NULL,
    auth_password VARCHAR(255) NULL,
    priv_protocol ENUM('DES', 'AES') NULL,
    priv_password VARCHAR(255) NULL,
    username VARCHAR(255) NULL,
    -- Device info
    vendor ENUM('auto', 'mikrotik', 'cisco', 'huawei', 'juniper', 'hp_aruba', 'generic') DEFAULT 'auto',
    sys_descr TEXT,
    sys_name VARCHAR(255),
    sys_location VARCHAR(255),
    -- Status
    status ENUM('online', 'offline', 'unknown') DEFAULT 'unknown',
    last_poll_at TIMESTAMP NULL,
    poll_interval INT DEFAULT 30 COMMENT 'seconds',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip (ip_address),
    INDEX idx_status (status)
);

-- SNMP Interfaces table
CREATE TABLE snmp_interfaces (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36) NOT NULL,
    if_index INT NOT NULL,
    if_name VARCHAR(255),
    if_descr VARCHAR(255),
    if_type INT,
    if_speed BIGINT COMMENT 'bits per second',
    if_admin_status ENUM('up', 'down', 'testing') DEFAULT 'up',
    if_oper_status ENUM('up', 'down', 'testing', 'unknown', 'dormant', 'notPresent', 'lowerLayerDown') DEFAULT 'unknown',
    monitor_bandwidth BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE,
    UNIQUE KEY uk_device_ifindex (device_id, if_index)
);

-- Bandwidth history table (untuk grafik)
CREATE TABLE bandwidth_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    interface_id CHAR(36) NOT NULL,
    in_octets BIGINT UNSIGNED DEFAULT 0,
    out_octets BIGINT UNSIGNED DEFAULT 0,
    in_rate DECIMAL(15, 2) DEFAULT 0 COMMENT 'Mbps',
    out_rate DECIMAL(15, 2) DEFAULT 0 COMMENT 'Mbps',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES snmp_interfaces(id) ON DELETE CASCADE,
    INDEX idx_interface_time (interface_id, recorded_at)
);

-- Ping targets table
CREATE TABLE ping_targets (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL COMMENT 'IP or hostname',
    group_name VARCHAR(100) DEFAULT 'Default',
    interval_seconds INT DEFAULT 30,
    timeout_ms INT DEFAULT 5000,
    packet_count INT DEFAULT 3,
    enabled BOOLEAN DEFAULT TRUE,
    status ENUM('online', 'offline', 'unknown') DEFAULT 'unknown',
    last_ping_at TIMESTAMP NULL,
    last_latency_ms DECIMAL(10, 2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_group (group_name)
);

-- Ping history table
CREATE TABLE ping_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id CHAR(36) NOT NULL,
    status ENUM('success', 'timeout', 'error') NOT NULL,
    latency_ms DECIMAL(10, 2) NULL,
    packet_loss INT DEFAULT 0 COMMENT 'percentage',
    error_message VARCHAR(255) NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES ping_targets(id) ON DELETE CASCADE,
    INDEX idx_target_time (target_id, recorded_at)
);

-- Notification settings table
CREATE TABLE notification_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    -- Telegram
    telegram_enabled BOOLEAN DEFAULT FALSE,
    telegram_bot_token VARCHAR(255),
    telegram_chat_id VARCHAR(100),
    -- Email
    email_enabled BOOLEAN DEFAULT FALSE,
    smtp_host VARCHAR(255),
    smtp_port INT DEFAULT 587,
    smtp_username VARCHAR(255),
    smtp_password VARCHAR(255),
    smtp_encryption ENUM('tls', 'ssl', 'none') DEFAULT 'tls',
    email_from VARCHAR(255),
    email_to TEXT COMMENT 'comma-separated emails',
    -- Thresholds
    latency_threshold_ms INT DEFAULT 100,
    bandwidth_threshold_percent INT DEFAULT 90,
    -- Flapping detection
    flapping_enabled BOOLEAN DEFAULT TRUE,
    flapping_transitions INT DEFAULT 5,
    flapping_window_minutes INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Alert logs table
CREATE TABLE alert_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    type ENUM('device_down', 'device_up', 'ping_down', 'ping_up', 'high_latency', 'bandwidth_high', 'flapping_start', 'flapping_stop') NOT NULL,
    source_type ENUM('device', 'interface', 'ping_target') NOT NULL,
    source_id CHAR(36) NOT NULL,
    source_name VARCHAR(255),
    message TEXT NOT NULL,
    notified_telegram BOOLEAN DEFAULT FALSE,
    notified_email BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_source (source_type, source_id),
    INDEX idx_created (created_at)
);

-- Data retention cleanup (event scheduler)
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_data
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    -- Keep bandwidth history for 365 days
    DELETE FROM bandwidth_history WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
    -- Keep ping history for 365 days
    DELETE FROM ping_history WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
    -- Keep alert logs for 90 days
    DELETE FROM alert_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
END//
DELIMITER ;

-- Enable event scheduler
SET GLOBAL event_scheduler = ON;
```

---

## 2. Laravel 11/12 Project Setup

### Installation

```bash
# Create Laravel 11/12 project
composer create-project laravel/laravel isp-billing "^11.0"
cd isp-billing

# Required packages
composer require laravel/sanctum         # API Authentication
composer require evilfreelancer/routeros-api-php  # MikroTik API
composer require php-mqtt/client         # MQTT (optional)
composer require guzzlehttp/guzzle       # HTTP client
composer require spatie/laravel-permission # Role management (optional)

# SNMP - install system package
# Ubuntu/Debian: sudo apt install php-snmp snmp
# CentOS/RHEL: sudo yum install php-snmp net-snmp-utils

# Install Sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate
```

### Environment Configuration (.env)

```env
APP_NAME="ISP Billing"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://your-domain.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=your_username
DB_PASSWORD=your_password

# Sanctum
SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173,your-frontend-domain.com

# MikroTik Default (can be overridden in DB)
MIKROTIK_HOST=192.168.1.1
MIKROTIK_PORT=8728
MIKROTIK_USER=admin
MIKROTIK_PASS=password

# SNMP Defaults
SNMP_COMMUNITY=public
SNMP_TIMEOUT=5
SNMP_RETRIES=2

# Telegram Notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Email Notifications
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@yourisp.com
MAIL_FROM_NAME="${APP_NAME}"
```

---

## 3. Laravel Project Structure

```
isp-billing/
├── app/
│   ├── Console/
│   │   └── Commands/
│   │       ├── SnmpPollDevices.php
│   │       ├── PingTargets.php
│   │       ├── ProcessSubscriptions.php
│   │       └── CleanupOldData.php
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── Api/
│   │   │       ├── AuthController.php
│   │   │       ├── CustomerController.php
│   │   │       ├── PackageController.php
│   │   │       ├── SubscriptionController.php
│   │   │       ├── InvoiceController.php
│   │   │       ├── PaymentController.php
│   │   │       ├── RouterSettingController.php
│   │   │       ├── MikrotikController.php
│   │   │       ├── SnmpDeviceController.php
│   │   │       ├── PingTargetController.php
│   │   │       └── MonitoringController.php
│   │   ├── Middleware/
│   │   │   └── ForceJsonResponse.php
│   │   └── Resources/
│   │       └── (API Resources)
│   ├── Jobs/
│   │   ├── PollSnmpDevice.php
│   │   ├── PingTarget.php
│   │   └── SendNotification.php
│   ├── Models/
│   │   ├── User.php
│   │   ├── Customer.php
│   │   ├── Package.php
│   │   ├── Subscription.php
│   │   ├── Invoice.php
│   │   ├── Payment.php
│   │   ├── RouterSetting.php
│   │   ├── MikrotikSecret.php
│   │   ├── SnmpDevice.php
│   │   ├── SnmpInterface.php
│   │   ├── BandwidthHistory.php
│   │   ├── PingTarget.php
│   │   ├── PingHistory.php
│   │   ├── NotificationSetting.php
│   │   └── AlertLog.php
│   ├── Services/
│   │   ├── MikrotikService.php
│   │   ├── SnmpService.php
│   │   ├── PingService.php
│   │   └── NotificationService.php
│   └── Traits/
│       └── HasUuid.php
├── config/
│   └── cors.php
├── database/
│   └── migrations/
├── routes/
│   └── api.php
└── ...
```

---

## 4. API Routes (routes/api.php)

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\{
    AuthController,
    CustomerController,
    PackageController,
    SubscriptionController,
    InvoiceController,
    PaymentController,
    RouterSettingController,
    MikrotikController,
    MikrotikSecretController,
    SnmpDeviceController,
    PingTargetController,
    MonitoringController,
    NotificationSettingController
};

// =============================================
// PUBLIC ROUTES
// =============================================
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

// =============================================
// PROTECTED ROUTES
// =============================================
Route::middleware('auth:sanctum')->group(function () {
    
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::put('/user/password', [AuthController::class, 'updatePassword']);

    // ==========================================
    // ISP BILLING
    // ==========================================
    
    // Customers
    Route::apiResource('customers', CustomerController::class);
    Route::get('/customers/{id}/subscriptions', [CustomerController::class, 'subscriptions']);
    
    // Packages
    Route::apiResource('packages', PackageController::class);
    Route::post('/packages/{id}/sync-mikrotik', [PackageController::class, 'syncMikrotik']);
    
    // Subscriptions
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('/subscriptions/{id}/create-mikrotik-user', [SubscriptionController::class, 'createMikrotikUser']);
    Route::post('/subscriptions/{id}/renew', [SubscriptionController::class, 'renew']);
    
    // Invoices
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('/invoices/{id}/mark-paid', [InvoiceController::class, 'markPaid']);
    
    // Payments
    Route::apiResource('payments', PaymentController::class);

    // ==========================================
    // MIKROTIK INTEGRATION
    // ==========================================
    
    // Router Settings
    Route::get('/router-settings', [RouterSettingController::class, 'index']);
    Route::post('/router-settings', [RouterSettingController::class, 'store']);
    Route::put('/router-settings/{id}', [RouterSettingController::class, 'update']);
    Route::delete('/router-settings/{id}', [RouterSettingController::class, 'destroy']);
    Route::post('/router-settings/{id}/test', [RouterSettingController::class, 'testConnection']);
    
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

    // ==========================================
    // SNMP MONITORING (SMon-style)
    // ==========================================
    
    // SNMP Devices
    Route::apiResource('snmp-devices', SnmpDeviceController::class);
    Route::post('/snmp-devices/{id}/poll', [SnmpDeviceController::class, 'poll']);
    Route::post('/snmp-devices/{id}/discover-interfaces', [SnmpDeviceController::class, 'discoverInterfaces']);
    Route::get('/snmp-devices/{id}/interfaces', [SnmpDeviceController::class, 'interfaces']);
    Route::put('/snmp-devices/{deviceId}/interfaces/{interfaceId}', [SnmpDeviceController::class, 'updateInterface']);
    
    // Ping Targets
    Route::apiResource('ping-targets', PingTargetController::class);
    Route::post('/ping-targets/{id}/ping-now', [PingTargetController::class, 'pingNow']);
    Route::get('/ping-targets/groups', [PingTargetController::class, 'groups']);
    
    // Monitoring Dashboard
    Route::prefix('monitoring')->group(function () {
        Route::get('/dashboard', [MonitoringController::class, 'dashboard']);
        Route::get('/bandwidth/{interfaceId}', [MonitoringController::class, 'bandwidth']);
        Route::get('/ping-history/{targetId}', [MonitoringController::class, 'pingHistory']);
        Route::get('/alerts', [MonitoringController::class, 'alerts']);
        Route::get('/system-info', [MonitoringController::class, 'systemInfo']);
    });
    
    // Notification Settings
    Route::get('/notification-settings', [NotificationSettingController::class, 'index']);
    Route::put('/notification-settings', [NotificationSettingController::class, 'update']);
    Route::post('/notification-settings/test-telegram', [NotificationSettingController::class, 'testTelegram']);
    Route::post('/notification-settings/test-email', [NotificationSettingController::class, 'testEmail']);
});
```

---

## 5. Core Services

### MikrotikService.php

```php
<?php

namespace App\Services;

use App\Models\RouterSetting;
use RouterOS\Client;
use RouterOS\Query;
use Illuminate\Support\Facades\Log;

class MikrotikService
{
    protected ?Client $client = null;
    protected ?RouterSetting $settings = null;

    public function __construct(?RouterSetting $settings = null)
    {
        $this->settings = $settings ?? RouterSetting::where('is_active', true)->first();
    }

    /**
     * Connect to MikroTik Router
     */
    public function connect(): self
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
            
            Log::info("Connected to MikroTik at {$this->settings->host}");
            return $this;
        } catch (\Exception $e) {
            Log::error("MikroTik connection failed: " . $e->getMessage());
            throw new \Exception('Failed to connect to MikroTik: ' . $e->getMessage());
        }
    }

    /**
     * Get system resource info
     */
    public function getSystemResource(): array
    {
        $this->ensureConnected();
        
        $query = new Query('/system/resource/print');
        $response = $this->client->query($query)->read();
        
        if (empty($response)) {
            return [];
        }

        $data = $response[0];
        $totalMem = (int) ($data['total-memory'] ?? 1);
        $freeMem = (int) ($data['free-memory'] ?? 0);
        
        return [
            'cpu' => (int) ($data['cpu-load'] ?? 0),
            'memory' => (int) ((($totalMem - $freeMem) / $totalMem) * 100),
            'uptime' => $data['uptime'] ?? '0s',
            'version' => $data['version'] ?? 'Unknown',
            'board' => $data['board-name'] ?? 'Unknown',
            'temperature' => isset($data['cpu-temperature']) 
                ? (int) preg_replace('/[^0-9]/', '', $data['cpu-temperature']) 
                : null,
        ];
    }

    /**
     * Get online PPPoE/Hotspot users
     */
    public function getOnlineUsers(): array
    {
        $this->ensureConnected();
        
        $users = [];

        // PPPoE active sessions
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

        // Hotspot active sessions
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
     * Toggle user (enable/disable)
     */
    public function toggleUser(string $username, bool $enable): bool
    {
        $this->ensureConnected();

        // Try PPPoE secret first
        $query = (new Query('/ppp/secret/print'))->where('name', $username);
        $secrets = $this->client->query($query)->read();

        if (!empty($secrets)) {
            $setQuery = (new Query('/ppp/secret/set'))
                ->equal('.id', $secrets[0]['.id'])
                ->equal('disabled', $enable ? 'no' : 'yes');
            $this->client->query($setQuery)->read();
            
            Log::info("Toggled PPPoE user {$username} to " . ($enable ? 'enabled' : 'disabled'));
            return true;
        }

        // Try Hotspot user
        $query = (new Query('/ip/hotspot/user/print'))->where('name', $username);
        $users = $this->client->query($query)->read();

        if (!empty($users)) {
            $setQuery = (new Query('/ip/hotspot/user/set'))
                ->equal('.id', $users[0]['.id'])
                ->equal('disabled', $enable ? 'no' : 'yes');
            $this->client->query($setQuery)->read();
            
            Log::info("Toggled Hotspot user {$username} to " . ($enable ? 'enabled' : 'disabled'));
            return true;
        }

        return false;
    }

    /**
     * Disconnect active user
     */
    public function disconnectUser(string $username): bool
    {
        $this->ensureConnected();

        // Try PPPoE active
        $query = (new Query('/ppp/active/print'))->where('name', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ppp/active/remove'))
                ->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            
            Log::info("Disconnected PPPoE user {$username}");
            return true;
        }

        // Try Hotspot active
        $query = (new Query('/ip/hotspot/active/print'))->where('user', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ip/hotspot/active/remove'))
                ->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            
            Log::info("Disconnected Hotspot user {$username}");
            return true;
        }

        return false;
    }

    /**
     * Create PPPoE/Hotspot user
     */
    public function createUser(string $username, string $password, string $profile, string $service = 'pppoe'): bool
    {
        $this->ensureConnected();

        if ($service === 'pppoe' || $service === 'any') {
            $query = (new Query('/ppp/secret/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('service', $service === 'any' ? 'any' : 'pppoe')
                ->equal('profile', $profile);
        } else {
            $query = (new Query('/ip/hotspot/user/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('profile', $profile);
        }

        $this->client->query($query)->read();
        Log::info("Created {$service} user {$username}");
        return true;
    }

    /**
     * Import all PPPoE secrets
     */
    public function importSecrets(): array
    {
        $this->ensureConnected();

        $query = new Query('/ppp/secret/print');
        $secrets = $this->client->query($query)->read();

        return array_map(fn($secret) => [
            'username' => $secret['name'] ?? '',
            'password' => $secret['password'] ?? '',
            'service' => $secret['service'] ?? 'pppoe',
            'profile' => $secret['profile'] ?? '',
            'local_address' => $secret['local-address'] ?? '',
            'remote_address' => $secret['remote-address'] ?? '',
            'comment' => $secret['comment'] ?? '',
            'disabled' => ($secret['disabled'] ?? 'false') === 'true',
        ], $secrets);
    }

    /**
     * Get interface traffic
     */
    public function getTraffic(): array
    {
        $this->ensureConnected();

        $query = new Query('/interface/print');
        $interfaces = $this->client->query($query)->read();

        return array_filter(array_map(function ($iface) {
            if (!isset($iface['type']) || !in_array($iface['type'], ['ether', 'pppoe-out', 'vlan', 'bridge'])) {
                return null;
            }
            return [
                'name' => $iface['name'] ?? '',
                'rx_bytes' => (int) ($iface['rx-byte'] ?? 0),
                'tx_bytes' => (int) ($iface['tx-byte'] ?? 0),
                'running' => ($iface['running'] ?? 'false') === 'true',
            ];
        }, $interfaces));
    }

    protected function ensureConnected(): void
    {
        if (!$this->client) {
            $this->connect();
        }
    }
}
```

### SnmpService.php

```php
<?php

namespace App\Services;

use App\Models\SnmpDevice;
use App\Models\SnmpInterface;
use App\Models\BandwidthHistory;
use App\Models\AlertLog;
use Illuminate\Support\Facades\Log;

class SnmpService
{
    // Standard MIB-II OIDs
    const OID_SYS_DESCR = '.1.3.6.1.2.1.1.1.0';
    const OID_SYS_NAME = '.1.3.6.1.2.1.1.5.0';
    const OID_SYS_LOCATION = '.1.3.6.1.2.1.1.6.0';
    const OID_SYS_UPTIME = '.1.3.6.1.2.1.1.3.0';
    const OID_IF_NUMBER = '.1.3.6.1.2.1.2.1.0';
    const OID_IF_TABLE = '.1.3.6.1.2.1.2.2.1';
    const OID_IF_DESCR = '.1.3.6.1.2.1.2.2.1.2';
    const OID_IF_TYPE = '.1.3.6.1.2.1.2.2.1.3';
    const OID_IF_SPEED = '.1.3.6.1.2.1.2.2.1.5';
    const OID_IF_ADMIN_STATUS = '.1.3.6.1.2.1.2.2.1.7';
    const OID_IF_OPER_STATUS = '.1.3.6.1.2.1.2.2.1.8';
    const OID_IF_IN_OCTETS = '.1.3.6.1.2.1.2.2.1.10';
    const OID_IF_OUT_OCTETS = '.1.3.6.1.2.1.2.2.1.16';
    
    // 64-bit counters (for high-speed interfaces)
    const OID_IF_HC_IN_OCTETS = '.1.3.6.1.2.1.31.1.1.1.6';
    const OID_IF_HC_OUT_OCTETS = '.1.3.6.1.2.1.31.1.1.1.10';
    const OID_IF_NAME = '.1.3.6.1.2.1.31.1.1.1.1';

    // Vendor-specific OIDs
    protected array $vendorOids = [
        'cisco' => [
            'in_octets' => '.1.3.6.1.2.1.31.1.1.1.6',  // ifHCInOctets
            'out_octets' => '.1.3.6.1.2.1.31.1.1.1.10', // ifHCOutOctets
        ],
        'huawei' => [
            'in_octets' => '.1.3.6.1.2.1.31.1.1.1.6',
            'out_octets' => '.1.3.6.1.2.1.31.1.1.1.10',
        ],
        'mikrotik' => [
            'in_octets' => '.1.3.6.1.2.1.2.2.1.10',
            'out_octets' => '.1.3.6.1.2.1.2.2.1.16',
        ],
        'juniper' => [
            'in_octets' => '.1.3.6.1.2.1.31.1.1.1.6',
            'out_octets' => '.1.3.6.1.2.1.31.1.1.1.10',
        ],
        'hp_aruba' => [
            'in_octets' => '.1.3.6.1.2.1.31.1.1.1.6',
            'out_octets' => '.1.3.6.1.2.1.31.1.1.1.10',
        ],
    ];

    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * Detect vendor from sysDescr
     */
    public function detectVendor(string $sysDescr): string
    {
        $sysDescr = strtolower($sysDescr);
        
        if (str_contains($sysDescr, 'cisco')) return 'cisco';
        if (str_contains($sysDescr, 'huawei')) return 'huawei';
        if (str_contains($sysDescr, 'mikrotik') || str_contains($sysDescr, 'routeros')) return 'mikrotik';
        if (str_contains($sysDescr, 'juniper') || str_contains($sysDescr, 'junos')) return 'juniper';
        if (str_contains($sysDescr, 'hp') || str_contains($sysDescr, 'procurve') || str_contains($sysDescr, 'aruba')) return 'hp_aruba';
        
        return 'generic';
    }

    /**
     * Get system info from device
     */
    public function getSystemInfo(SnmpDevice $device): array
    {
        $session = $this->createSession($device);
        
        $sysDescr = @snmp2_get($session['host'], $session['community'], self::OID_SYS_DESCR, $session['timeout'], $session['retries']);
        $sysName = @snmp2_get($session['host'], $session['community'], self::OID_SYS_NAME, $session['timeout'], $session['retries']);
        $sysLocation = @snmp2_get($session['host'], $session['community'], self::OID_SYS_LOCATION, $session['timeout'], $session['retries']);
        $sysUptime = @snmp2_get($session['host'], $session['community'], self::OID_SYS_UPTIME, $session['timeout'], $session['retries']);

        return [
            'sys_descr' => $this->cleanSnmpValue($sysDescr),
            'sys_name' => $this->cleanSnmpValue($sysName),
            'sys_location' => $this->cleanSnmpValue($sysLocation),
            'uptime' => $this->cleanSnmpValue($sysUptime),
        ];
    }

    /**
     * Discover interfaces on device
     */
    public function discoverInterfaces(SnmpDevice $device): array
    {
        $session = $this->createSession($device);
        
        // Walk interface descriptions
        $ifDescrs = @snmp2_walk($session['host'], $session['community'], self::OID_IF_DESCR, $session['timeout'], $session['retries']);
        
        if (!$ifDescrs) {
            throw new \Exception("Failed to get interfaces from device");
        }

        $interfaces = [];
        foreach ($ifDescrs as $index => $descr) {
            $ifIndex = $index + 1;
            
            $ifName = @snmp2_get($session['host'], $session['community'], self::OID_IF_NAME . '.' . $ifIndex, $session['timeout'], $session['retries']);
            $ifType = @snmp2_get($session['host'], $session['community'], self::OID_IF_TYPE . '.' . $ifIndex, $session['timeout'], $session['retries']);
            $ifSpeed = @snmp2_get($session['host'], $session['community'], self::OID_IF_SPEED . '.' . $ifIndex, $session['timeout'], $session['retries']);
            $ifAdminStatus = @snmp2_get($session['host'], $session['community'], self::OID_IF_ADMIN_STATUS . '.' . $ifIndex, $session['timeout'], $session['retries']);
            $ifOperStatus = @snmp2_get($session['host'], $session['community'], self::OID_IF_OPER_STATUS . '.' . $ifIndex, $session['timeout'], $session['retries']);

            $interfaces[] = [
                'if_index' => $ifIndex,
                'if_name' => $this->cleanSnmpValue($ifName) ?: $this->cleanSnmpValue($descr),
                'if_descr' => $this->cleanSnmpValue($descr),
                'if_type' => (int) $this->cleanSnmpValue($ifType),
                'if_speed' => (int) $this->cleanSnmpValue($ifSpeed),
                'if_admin_status' => $this->mapAdminStatus($this->cleanSnmpValue($ifAdminStatus)),
                'if_oper_status' => $this->mapOperStatus($this->cleanSnmpValue($ifOperStatus)),
            ];
        }

        return $interfaces;
    }

    /**
     * Poll bandwidth for device interfaces
     */
    public function pollBandwidth(SnmpDevice $device): array
    {
        $session = $this->createSession($device);
        $vendor = $device->vendor === 'auto' ? $this->detectVendor($device->sys_descr ?? '') : $device->vendor;
        $oids = $this->vendorOids[$vendor] ?? $this->vendorOids['mikrotik'];
        
        $interfaces = $device->interfaces()->where('monitor_bandwidth', true)->get();
        $results = [];

        foreach ($interfaces as $interface) {
            $ifIndex = $interface->if_index;
            
            // Get current counters
            $inOctets = @snmp2_get($session['host'], $session['community'], $oids['in_octets'] . '.' . $ifIndex, $session['timeout'], $session['retries']);
            $outOctets = @snmp2_get($session['host'], $session['community'], $oids['out_octets'] . '.' . $ifIndex, $session['timeout'], $session['retries']);
            
            if ($inOctets === false || $outOctets === false) {
                // Fallback to standard OIDs
                $inOctets = @snmp2_get($session['host'], $session['community'], self::OID_IF_IN_OCTETS . '.' . $ifIndex, $session['timeout'], $session['retries']);
                $outOctets = @snmp2_get($session['host'], $session['community'], self::OID_IF_OUT_OCTETS . '.' . $ifIndex, $session['timeout'], $session['retries']);
            }

            $inOctets = (int) $this->cleanSnmpValue($inOctets);
            $outOctets = (int) $this->cleanSnmpValue($outOctets);

            // Calculate rate from last record
            $lastRecord = BandwidthHistory::where('interface_id', $interface->id)
                ->orderBy('recorded_at', 'desc')
                ->first();

            $inRate = 0;
            $outRate = 0;

            if ($lastRecord) {
                $timeDiff = now()->diffInSeconds($lastRecord->recorded_at);
                if ($timeDiff > 0) {
                    // Handle counter wrap
                    $inDiff = $inOctets >= $lastRecord->in_octets 
                        ? $inOctets - $lastRecord->in_octets 
                        : (PHP_INT_MAX - $lastRecord->in_octets) + $inOctets;
                    $outDiff = $outOctets >= $lastRecord->out_octets 
                        ? $outOctets - $lastRecord->out_octets 
                        : (PHP_INT_MAX - $lastRecord->out_octets) + $outOctets;

                    // Convert to Mbps
                    $inRate = round(($inDiff * 8) / ($timeDiff * 1000000), 2);
                    $outRate = round(($outDiff * 8) / ($timeDiff * 1000000), 2);
                }
            }

            // Save to history
            BandwidthHistory::create([
                'interface_id' => $interface->id,
                'in_octets' => $inOctets,
                'out_octets' => $outOctets,
                'in_rate' => $inRate,
                'out_rate' => $outRate,
            ]);

            $results[] = [
                'interface_id' => $interface->id,
                'if_name' => $interface->if_name,
                'in_rate' => $inRate,
                'out_rate' => $outRate,
            ];
        }

        // Update device last poll time
        $device->update([
            'last_poll_at' => now(),
            'status' => 'online',
        ]);

        return $results;
    }

    /**
     * Check device connectivity
     */
    public function checkDevice(SnmpDevice $device): bool
    {
        $session = $this->createSession($device);
        
        $result = @snmp2_get($session['host'], $session['community'], self::OID_SYS_DESCR, $session['timeout'], $session['retries']);
        
        $wasOnline = $device->status === 'online';
        $isOnline = $result !== false;
        
        // Update status
        $device->update([
            'status' => $isOnline ? 'online' : 'offline',
            'last_poll_at' => now(),
        ]);

        // Send notification if status changed
        if ($wasOnline && !$isOnline) {
            $this->notificationService->sendAlert(
                'device_down',
                'device',
                $device->id,
                $device->name,
                "Device {$device->name} ({$device->ip_address}) is DOWN"
            );
        } elseif (!$wasOnline && $isOnline) {
            $this->notificationService->sendAlert(
                'device_up',
                'device',
                $device->id,
                $device->name,
                "Device {$device->name} ({$device->ip_address}) is UP"
            );
        }

        return $isOnline;
    }

    protected function createSession(SnmpDevice $device): array
    {
        return [
            'host' => $device->ip_address,
            'community' => $device->community ?? 'public',
            'timeout' => config('snmp.timeout', 5) * 1000000,
            'retries' => config('snmp.retries', 2),
        ];
    }

    protected function cleanSnmpValue($value): string
    {
        if ($value === false || $value === null) {
            return '';
        }
        // Remove SNMP type prefixes like "STRING: ", "INTEGER: ", etc.
        return trim(preg_replace('/^[A-Z]+:\s*/', '', $value));
    }

    protected function mapAdminStatus($value): string
    {
        return match ((int) $value) {
            1 => 'up',
            2 => 'down',
            3 => 'testing',
            default => 'up',
        };
    }

    protected function mapOperStatus($value): string
    {
        return match ((int) $value) {
            1 => 'up',
            2 => 'down',
            3 => 'testing',
            4 => 'unknown',
            5 => 'dormant',
            6 => 'notPresent',
            7 => 'lowerLayerDown',
            default => 'unknown',
        };
    }
}
```

### PingService.php

```php
<?php

namespace App\Services;

use App\Models\PingTarget;
use App\Models\PingHistory;
use Illuminate\Support\Facades\Log;

class PingService
{
    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * Ping a target and record results
     */
    public function ping(PingTarget $target): array
    {
        $host = $target->host;
        $count = $target->packet_count ?? 3;
        $timeout = ($target->timeout_ms ?? 5000) / 1000; // Convert to seconds

        // Execute ping command
        $output = [];
        $returnCode = 0;
        
        if (PHP_OS_FAMILY === 'Windows') {
            exec("ping -n {$count} -w " . ($timeout * 1000) . " {$host} 2>&1", $output, $returnCode);
        } else {
            exec("ping -c {$count} -W {$timeout} {$host} 2>&1", $output, $returnCode);
        }

        $outputStr = implode("\n", $output);
        
        // Parse results
        $result = $this->parsePingOutput($outputStr, PHP_OS_FAMILY === 'Windows');
        
        // Determine status
        $status = 'success';
        $errorMessage = null;
        
        if ($result['packet_loss'] === 100) {
            $status = 'timeout';
            $errorMessage = 'All packets lost';
        } elseif ($result['packet_loss'] > 0) {
            $status = 'success'; // Partial success
        }

        // Save to history
        PingHistory::create([
            'target_id' => $target->id,
            'status' => $status,
            'latency_ms' => $result['avg_latency'],
            'packet_loss' => $result['packet_loss'],
            'error_message' => $errorMessage,
        ]);

        // Update target status
        $wasOnline = $target->status === 'online';
        $isOnline = $status === 'success';
        
        $target->update([
            'status' => $isOnline ? 'online' : 'offline',
            'last_ping_at' => now(),
            'last_latency_ms' => $result['avg_latency'],
        ]);

        // Send notifications
        if ($wasOnline && !$isOnline) {
            $this->notificationService->sendAlert(
                'ping_down',
                'ping_target',
                $target->id,
                $target->name,
                "Ping target {$target->name} ({$target->host}) is DOWN"
            );
        } elseif (!$wasOnline && $isOnline) {
            $this->notificationService->sendAlert(
                'ping_up',
                'ping_target',
                $target->id,
                $target->name,
                "Ping target {$target->name} ({$target->host}) is UP"
            );
        }

        // Check latency threshold
        $settings = \App\Models\NotificationSetting::first();
        if ($settings && $result['avg_latency'] > $settings->latency_threshold_ms) {
            $this->notificationService->sendAlert(
                'high_latency',
                'ping_target',
                $target->id,
                $target->name,
                "High latency on {$target->name}: {$result['avg_latency']}ms (threshold: {$settings->latency_threshold_ms}ms)"
            );
        }

        return [
            'target_id' => $target->id,
            'status' => $status,
            'latency_ms' => $result['avg_latency'],
            'packet_loss' => $result['packet_loss'],
        ];
    }

    protected function parsePingOutput(string $output, bool $isWindows): array
    {
        $avgLatency = null;
        $packetLoss = 100;

        if ($isWindows) {
            // Windows: Average = 10ms
            if (preg_match('/Average\s*=\s*(\d+)ms/i', $output, $matches)) {
                $avgLatency = (float) $matches[1];
            }
            // Windows: Lost = 0 (0% loss)
            if (preg_match('/Lost\s*=\s*\d+\s*\((\d+)%\s*loss\)/i', $output, $matches)) {
                $packetLoss = (int) $matches[1];
            }
        } else {
            // Linux: rtt min/avg/max/mdev = 0.123/0.456/0.789/0.012 ms
            if (preg_match('/rtt.*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+\s*ms/i', $output, $matches)) {
                $avgLatency = (float) $matches[1];
            }
            // Linux: 0% packet loss
            if (preg_match('/(\d+)%\s*packet\s*loss/i', $output, $matches)) {
                $packetLoss = (int) $matches[1];
            }
        }

        return [
            'avg_latency' => $avgLatency,
            'packet_loss' => $packetLoss,
        ];
    }
}
```

### NotificationService.php

```php
<?php

namespace App\Services;

use App\Models\NotificationSetting;
use App\Models\AlertLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Send alert notification
     */
    public function sendAlert(
        string $type,
        string $sourceType,
        string $sourceId,
        string $sourceName,
        string $message
    ): AlertLog {
        $settings = NotificationSetting::first();
        
        // Create alert log
        $alert = AlertLog::create([
            'type' => $type,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'source_name' => $sourceName,
            'message' => $message,
        ]);

        if (!$settings) {
            return $alert;
        }

        // Send Telegram notification
        if ($settings->telegram_enabled && $settings->telegram_bot_token && $settings->telegram_chat_id) {
            try {
                $this->sendTelegram($settings, $message);
                $alert->update(['notified_telegram' => true]);
            } catch (\Exception $e) {
                Log::error("Telegram notification failed: " . $e->getMessage());
            }
        }

        // Send Email notification
        if ($settings->email_enabled && $settings->email_to) {
            try {
                $this->sendEmail($settings, $type, $sourceName, $message);
                $alert->update(['notified_email' => true]);
            } catch (\Exception $e) {
                Log::error("Email notification failed: " . $e->getMessage());
            }
        }

        return $alert;
    }

    /**
     * Send Telegram message
     */
    public function sendTelegram(NotificationSetting $settings, string $message): bool
    {
        $url = "https://api.telegram.org/bot{$settings->telegram_bot_token}/sendMessage";
        
        $response = Http::post($url, [
            'chat_id' => $settings->telegram_chat_id,
            'text' => "🔔 *ISP Monitor Alert*\n\n{$message}",
            'parse_mode' => 'Markdown',
        ]);

        if (!$response->successful()) {
            throw new \Exception("Telegram API error: " . $response->body());
        }

        return true;
    }

    /**
     * Send Email notification
     */
    public function sendEmail(NotificationSetting $settings, string $type, string $subject, string $message): bool
    {
        $emails = array_map('trim', explode(',', $settings->email_to));
        
        // Configure mail on-the-fly if SMTP settings are in DB
        if ($settings->smtp_host) {
            config([
                'mail.mailers.smtp.host' => $settings->smtp_host,
                'mail.mailers.smtp.port' => $settings->smtp_port,
                'mail.mailers.smtp.username' => $settings->smtp_username,
                'mail.mailers.smtp.password' => $settings->smtp_password,
                'mail.mailers.smtp.encryption' => $settings->smtp_encryption === 'none' ? null : $settings->smtp_encryption,
                'mail.from.address' => $settings->email_from ?? config('mail.from.address'),
            ]);
        }

        Mail::raw($message, function ($mail) use ($emails, $type, $subject) {
            $mail->to($emails)
                ->subject("[ISP Monitor] {$type}: {$subject}");
        });

        return true;
    }

    /**
     * Test Telegram connection
     */
    public function testTelegram(string $botToken, string $chatId): bool
    {
        $settings = new NotificationSetting([
            'telegram_bot_token' => $botToken,
            'telegram_chat_id' => $chatId,
        ]);

        return $this->sendTelegram($settings, "✅ Test message from ISP Monitor");
    }

    /**
     * Test Email connection
     */
    public function testEmail(NotificationSetting $settings): bool
    {
        return $this->sendEmail($settings, 'Test', 'Test Connection', "✅ Test email from ISP Monitor\n\nIf you received this, email notifications are working correctly.");
    }
}
```

---

## 6. Console Commands

### SnmpPollDevices.php

```php
<?php

namespace App\Console\Commands;

use App\Models\SnmpDevice;
use App\Services\SnmpService;
use Illuminate\Console\Command;

class SnmpPollDevices extends Command
{
    protected $signature = 'snmp:poll {--device= : Specific device ID}';
    protected $description = 'Poll SNMP devices for bandwidth data';

    public function handle(SnmpService $snmpService): int
    {
        $deviceId = $this->option('device');
        
        $query = SnmpDevice::where('enabled', true);
        if ($deviceId) {
            $query->where('id', $deviceId);
        }
        
        $devices = $query->get();
        
        foreach ($devices as $device) {
            $this->info("Polling device: {$device->name} ({$device->ip_address})");
            
            try {
                // Check device connectivity
                $isOnline = $snmpService->checkDevice($device);
                
                if ($isOnline) {
                    // Poll bandwidth
                    $results = $snmpService->pollBandwidth($device);
                    $this->info("  Polled " . count($results) . " interfaces");
                } else {
                    $this->warn("  Device is offline");
                }
            } catch (\Exception $e) {
                $this->error("  Error: " . $e->getMessage());
            }
        }
        
        return Command::SUCCESS;
    }
}
```

### PingTargets.php

```php
<?php

namespace App\Console\Commands;

use App\Models\PingTarget;
use App\Services\PingService;
use Illuminate\Console\Command;

class PingTargets extends Command
{
    protected $signature = 'ping:targets {--target= : Specific target ID}';
    protected $description = 'Ping all enabled targets';

    public function handle(PingService $pingService): int
    {
        $targetId = $this->option('target');
        
        $query = PingTarget::where('enabled', true);
        if ($targetId) {
            $query->where('id', $targetId);
        }
        
        $targets = $query->get();
        
        foreach ($targets as $target) {
            $this->info("Pinging: {$target->name} ({$target->host})");
            
            try {
                $result = $pingService->ping($target);
                $status = $result['status'] === 'success' ? '✓' : '✗';
                $this->info("  {$status} Latency: {$result['latency_ms']}ms, Loss: {$result['packet_loss']}%");
            } catch (\Exception $e) {
                $this->error("  Error: " . $e->getMessage());
            }
        }
        
        return Command::SUCCESS;
    }
}
```

### Kernel.php (Task Scheduling)

```php
<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        // Poll SNMP devices every 30 seconds
        $schedule->command('snmp:poll')->everyThirtySeconds();
        
        // Ping targets every 30 seconds
        $schedule->command('ping:targets')->everyThirtySeconds();
        
        // Process expired subscriptions daily
        $schedule->command('subscriptions:process')->dailyAt('00:01');
        
        // Cleanup old data weekly
        $schedule->command('cleanup:old-data')->weekly();
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
    }
}
```

---

## 7. Installation Steps

```bash
# 1. Create Laravel 11/12 project
composer create-project laravel/laravel isp-billing "^11.0"
cd isp-billing

# 2. Install required packages
composer require laravel/sanctum
composer require evilfreelancer/routeros-api-php

# 3. Install SNMP PHP extension (Ubuntu/Debian)
sudo apt install php-snmp snmp

# 4. Publish Sanctum config
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"

# 5. Configure .env file (see section 2)

# 6. Run migrations
php artisan migrate

# 7. Create storage link
php artisan storage:link

# 8. Start development server
php artisan serve

# 9. Start scheduler (production)
# Add to crontab: * * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1

# 10. Or use Supervisor for continuous polling
# See supervisor config below
```

### Supervisor Configuration

```ini
[program:isp-snmp-poll]
process_name=%(program_name)s
command=php /var/www/isp-billing/artisan snmp:poll
autostart=true
autorestart=true
user=www-data
numprocs=1
redirect_stderr=true
stdout_logfile=/var/log/supervisor/snmp-poll.log

[program:isp-ping]
process_name=%(program_name)s  
command=php /var/www/isp-billing/artisan ping:targets
autostart=true
autorestart=true
user=www-data
numprocs=1
redirect_stderr=true
stdout_logfile=/var/log/supervisor/ping.log
```

---

## 8. API Endpoint Mapping

| Function | Laravel Endpoint | Method |
|----------|------------------|--------|
| **Auth** |
| Login | `/api/login` | POST |
| Logout | `/api/logout` | POST |
| Current User | `/api/user` | GET |
| **Billing** |
| Customers | `/api/customers` | CRUD |
| Packages | `/api/packages` | CRUD |
| Subscriptions | `/api/subscriptions` | CRUD |
| Invoices | `/api/invoices` | CRUD |
| Payments | `/api/payments` | CRUD |
| **MikroTik** |
| System Info | `/api/mikrotik/system` | GET |
| Online Users | `/api/mikrotik/online-users` | GET |
| User Detail | `/api/mikrotik/user-detail/{username}` | GET |
| Toggle User | `/api/mikrotik/toggle-user` | POST |
| Disconnect User | `/api/mikrotik/disconnect-user` | POST |
| Import Secrets | `/api/mikrotik/import-secrets` | POST |
| Sync Secret | `/api/mikrotik/sync-secret` | POST |
| Traffic | `/api/mikrotik/traffic` | GET |
| **SNMP Monitoring** |
| SNMP Devices | `/api/snmp-devices` | CRUD |
| Poll Device | `/api/snmp-devices/{id}/poll` | POST |
| Discover Interfaces | `/api/snmp-devices/{id}/discover-interfaces` | POST |
| Device Interfaces | `/api/snmp-devices/{id}/interfaces` | GET |
| **Ping Monitoring** |
| Ping Targets | `/api/ping-targets` | CRUD |
| Ping Now | `/api/ping-targets/{id}/ping-now` | POST |
| Target Groups | `/api/ping-targets/groups` | GET |
| **Dashboard** |
| Dashboard Stats | `/api/monitoring/dashboard` | GET |
| Bandwidth History | `/api/monitoring/bandwidth/{interfaceId}` | GET |
| Ping History | `/api/monitoring/ping-history/{targetId}` | GET |
| Alerts | `/api/monitoring/alerts` | GET |
| System Info | `/api/monitoring/system-info` | GET |
| **Notifications** |
| Settings | `/api/notification-settings` | GET/PUT |
| Test Telegram | `/api/notification-settings/test-telegram` | POST |
| Test Email | `/api/notification-settings/test-email` | POST |

---

## 9. Frontend Integration

Update frontend to call Laravel API:

```typescript
// src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
    });
    
    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API Error');
    }
    
    return response.json();
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{ token: string; user: any }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  // MikroTik
  getMikrotikSystem() {
    return this.request('/mikrotik/system');
  }

  getOnlineUsers() {
    return this.request('/mikrotik/online-users');
  }

  // SNMP Monitoring
  getSnmpDevices() {
    return this.request('/snmp-devices');
  }

  pollSnmpDevice(deviceId: string) {
    return this.request(`/snmp-devices/${deviceId}/poll`, { method: 'POST' });
  }

  // Ping Monitoring
  getPingTargets() {
    return this.request('/ping-targets');
  }

  pingNow(targetId: string) {
    return this.request(`/ping-targets/${targetId}/ping-now`, { method: 'POST' });
  }

  // Dashboard
  getDashboard() {
    return this.request('/monitoring/dashboard');
  }

  getBandwidthHistory(interfaceId: string, hours = 24) {
    return this.request(`/monitoring/bandwidth/${interfaceId}?hours=${hours}`);
  }

  getPingHistory(targetId: string, hours = 24) {
    return this.request(`/monitoring/ping-history/${targetId}?hours=${hours}`);
  }
}

export const api = new ApiClient();
```

---

## Notes

- **RouterOS v6**: Set `'legacy' => true` di MikrotikService
- **SNMP**: Install `php-snmp` extension dan `snmp` package
- **Scheduler**: Gunakan cron atau supervisor untuk background tasks
- **SMon Features**: Multi-vendor support, flapping detection, Telegram/Email alerts
- **Laravel 11/12**: Uses new directory structure, no Http/Kernel.php
