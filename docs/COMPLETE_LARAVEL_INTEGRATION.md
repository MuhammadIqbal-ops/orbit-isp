# Complete Laravel 11/12 Backend + Frontend Integration

Dokumentasi lengkap untuk migrasi dari Supabase Edge Functions ke Laravel backend dengan auto-integration ke frontend React.

---

## Table of Contents

1. [Backend Setup](#1-backend-setup)
2. [Database Schema (MySQL)](#2-database-schema-mysql)
3. [Laravel Models](#3-laravel-models)
4. [Laravel Services](#4-laravel-services)
5. [Laravel Controllers](#5-laravel-controllers)
6. [API Routes](#6-api-routes)
7. [Frontend API Client](#7-frontend-api-client)
8. [Frontend Component Changes](#8-frontend-component-changes)
9. [Authentication Migration](#9-authentication-migration)
10. [Deployment Guide](#10-deployment-guide)

---

## 1. Backend Setup

### Create Laravel Project

```bash
# Laravel 11/12
composer create-project laravel/laravel isp-billing "^11.0"
cd isp-billing

# Install packages
composer require laravel/sanctum
composer require evilfreelancer/routeros-api-php

# SNMP extension (Ubuntu/Debian)
sudo apt install php-snmp snmp

# Publish Sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
```

### .env Configuration

```env
APP_NAME="ISP Billing"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://api.yourdomain.com
APP_TIMEZONE=Asia/Jakarta

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=your_user
DB_PASSWORD=your_password

SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173,localhost:8080,yourdomain.com
SESSION_DOMAIN=.yourdomain.com

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# MikroTik Defaults
MIKROTIK_HOST=192.168.1.1
MIKROTIK_PORT=8728
MIKROTIK_USER=admin
MIKROTIK_PASS=password

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Email
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@yourisp.com
```

### CORS Configuration (config/cors.php)

```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://localhost:8080',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

---

## 2. Database Schema (MySQL)

```sql
-- =============================================
-- COMPLETE DATABASE SCHEMA
-- =============================================

CREATE DATABASE IF NOT EXISTS isp_billing 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE isp_billing;

-- =============================================
-- USERS & AUTH
-- =============================================

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator', 'viewer') DEFAULT 'operator',
    email_verified_at TIMESTAMP NULL,
    remember_token VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- Personal Access Tokens (Sanctum)
CREATE TABLE personal_access_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    abilities TEXT,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tokenable (tokenable_type, tokenable_id)
);

-- =============================================
-- ISP BILLING TABLES
-- =============================================

CREATE TABLE customers (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (name)
);

CREATE TABLE packages (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    bandwidth VARCHAR(50) NOT NULL COMMENT 'Format: 10M/10M',
    burst VARCHAR(100) COMMENT 'Format: 20M/20M 10M/10M 10/10 5',
    priority TINYINT DEFAULT 8,
    price DECIMAL(15, 2) NOT NULL,
    type ENUM('pppoe', 'hotspot', 'static') DEFAULT 'pppoe',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
    INDEX idx_package (package_id),
    INDEX idx_status (status),
    INDEX idx_end_date (end_date),
    INDEX idx_mikrotik_username (mikrotik_username)
);

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

CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    invoice_id CHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    method ENUM('cash', 'transfer', 'qris', 'ewallet', 'other') DEFAULT 'cash',
    transaction_id VARCHAR(255),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    INDEX idx_payment_date (payment_date)
);

CREATE TABLE billing_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    subscription_id CHAR(36),
    invoice_id CHAR(36),
    action VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    meta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    INDEX idx_action (action),
    INDEX idx_created (created_at)
);

-- =============================================
-- MIKROTIK TABLES
-- =============================================

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

CREATE TABLE mikrotik_secrets (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id CHAR(36),
    username VARCHAR(255) NOT NULL,
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
    UNIQUE KEY uk_username (username),
    INDEX idx_service (service)
);

-- =============================================
-- SNMP MONITORING TABLES
-- =============================================

CREATE TABLE snmp_devices (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    snmp_version ENUM('1', '2c', '3') DEFAULT '2c',
    community VARCHAR(255) DEFAULT 'public',
    security_level ENUM('noAuthNoPriv', 'authNoPriv', 'authPriv') NULL,
    auth_protocol ENUM('MD5', 'SHA') NULL,
    auth_password VARCHAR(255) NULL,
    priv_protocol ENUM('DES', 'AES') NULL,
    priv_password VARCHAR(255) NULL,
    snmp_username VARCHAR(255) NULL,
    vendor ENUM('auto', 'mikrotik', 'cisco', 'huawei', 'juniper', 'hp_aruba', 'generic') DEFAULT 'auto',
    sys_descr TEXT,
    sys_name VARCHAR(255),
    sys_location VARCHAR(255),
    status ENUM('online', 'offline', 'unknown') DEFAULT 'unknown',
    last_poll_at TIMESTAMP NULL,
    poll_interval INT DEFAULT 30,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip (ip_address),
    INDEX idx_status (status)
);

CREATE TABLE snmp_interfaces (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36) NOT NULL,
    if_index INT NOT NULL,
    if_name VARCHAR(255),
    if_descr VARCHAR(255),
    if_type INT,
    if_speed BIGINT,
    if_admin_status ENUM('up', 'down', 'testing') DEFAULT 'up',
    if_oper_status ENUM('up', 'down', 'testing', 'unknown', 'dormant', 'notPresent', 'lowerLayerDown') DEFAULT 'unknown',
    monitor_bandwidth BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES snmp_devices(id) ON DELETE CASCADE,
    UNIQUE KEY uk_device_ifindex (device_id, if_index)
);

CREATE TABLE bandwidth_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    interface_id CHAR(36) NOT NULL,
    in_octets BIGINT UNSIGNED DEFAULT 0,
    out_octets BIGINT UNSIGNED DEFAULT 0,
    in_rate DECIMAL(15, 2) DEFAULT 0,
    out_rate DECIMAL(15, 2) DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interface_id) REFERENCES snmp_interfaces(id) ON DELETE CASCADE,
    INDEX idx_interface_time (interface_id, recorded_at)
);

CREATE TABLE ping_targets (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
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

CREATE TABLE ping_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id CHAR(36) NOT NULL,
    status ENUM('success', 'timeout', 'error') NOT NULL,
    latency_ms DECIMAL(10, 2) NULL,
    packet_loss INT DEFAULT 0,
    error_message VARCHAR(255) NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES ping_targets(id) ON DELETE CASCADE,
    INDEX idx_target_time (target_id, recorded_at)
);

CREATE TABLE notification_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    telegram_enabled BOOLEAN DEFAULT FALSE,
    telegram_bot_token VARCHAR(255),
    telegram_chat_id VARCHAR(100),
    email_enabled BOOLEAN DEFAULT FALSE,
    smtp_host VARCHAR(255),
    smtp_port INT DEFAULT 587,
    smtp_username VARCHAR(255),
    smtp_password VARCHAR(255),
    smtp_encryption ENUM('tls', 'ssl', 'none') DEFAULT 'tls',
    email_from VARCHAR(255),
    email_to TEXT,
    latency_threshold_ms INT DEFAULT 100,
    bandwidth_threshold_percent INT DEFAULT 90,
    flapping_enabled BOOLEAN DEFAULT TRUE,
    flapping_transitions INT DEFAULT 5,
    flapping_window_minutes INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
    INDEX idx_created (created_at)
);

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Default admin user (password: admin123)
INSERT INTO users (id, name, email, password, role) VALUES 
(UUID(), 'Administrator', 'admin@isp.local', '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Default notification settings
INSERT INTO notification_settings (id) VALUES (UUID());

-- =============================================
-- DATA RETENTION CLEANUP EVENT
-- =============================================

DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_data
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    DELETE FROM bandwidth_history WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
    DELETE FROM ping_history WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
    DELETE FROM alert_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
    DELETE FROM billing_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
END//
DELIMITER ;

SET GLOBAL event_scheduler = ON;
```

---

## 3. Laravel Models

### app/Models/User.php

```php
<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use App\Traits\HasUuid;

class User extends Authenticatable
{
    use HasApiTokens, HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name', 'email', 'password', 'role',
    ];

    protected $hidden = [
        'password', 'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
```

### app/Models/Customer.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\HasUuid;

class Customer extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name', 'email', 'phone', 'address', 'status',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function mikrotikSecrets(): HasMany
    {
        return $this->hasMany(MikrotikSecret::class);
    }
}
```

### app/Models/Package.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\HasUuid;

class Package extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name', 'bandwidth', 'burst', 'priority', 'price', 'type',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'priority' => 'integer',
        ];
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
```

### app/Models/Subscription.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\HasUuid;

class Subscription extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'customer_id', 'package_id', 'mikrotik_username', 'mikrotik_password',
        'start_date', 'end_date', 'auto_renew', 'status',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'auto_renew' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(Package::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }
}
```

### app/Models/Invoice.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\HasUuid;

class Invoice extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'subscription_id', 'amount', 'due_date', 'status',
        'payment_reference', 'payment_url', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'due_date' => 'date',
        ];
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
```

### app/Models/Payment.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\HasUuid;

class Payment extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;
    
    public $timestamps = false;

    protected $fillable = [
        'invoice_id', 'amount', 'method', 'transaction_id', 'payment_date',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'payment_date' => 'datetime',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
```

### app/Models/RouterSetting.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class RouterSetting extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name', 'host', 'port', 'username', 'password', 'ssl', 'is_active',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'port' => 'integer',
            'ssl' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
```

### app/Models/MikrotikSecret.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\HasUuid;

class MikrotikSecret extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'customer_id', 'username', 'password', 'service', 'profile',
        'local_address', 'remote_address', 'comment', 'disabled',
    ];

    protected function casts(): array
    {
        return [
            'disabled' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
```

### app/Traits/HasUuid.php

```php
<?php

namespace App\Traits;

use Illuminate\Support\Str;

trait HasUuid
{
    protected static function bootHasUuid(): void
    {
        static::creating(function ($model) {
            if (empty($model->{$model->getKeyName()})) {
                $model->{$model->getKeyName()} = (string) Str::uuid();
            }
        });
    }
}
```

---

## 4. Laravel Services

### app/Services/MikrotikService.php

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
                'legacy' => true,
            ]);
            
            Log::info("Connected to MikroTik at {$this->settings->host}");
            return $this;
        } catch (\Exception $e) {
            Log::error("MikroTik connection failed: " . $e->getMessage());
            throw new \Exception('Failed to connect: ' . $e->getMessage());
        }
    }

    protected function ensureConnected(): void
    {
        if (!$this->client) {
            $this->connect();
        }
    }

    public function getSystemResource(): array
    {
        $this->ensureConnected();
        
        $query = new Query('/system/resource/print');
        $response = $this->client->query($query)->read();
        
        if (empty($response)) return [];

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

    public function getOnlineUsers(): array
    {
        $this->ensureConnected();
        $users = [];

        // PPPoE
        $pppoeQuery = new Query('/ppp/active/print');
        $pppoeUsers = $this->client->query($pppoeQuery)->read();
        
        foreach ($pppoeUsers as $user) {
            $users[] = [
                'id' => $user['.id'] ?? '',
                'username' => $user['name'] ?? '',
                'type' => 'pppoe',
                'address' => $user['address'] ?? '',
                'uptime' => $user['uptime'] ?? '0s',
                'downloadSpeed' => $this->formatSpeed($user['rx-byte'] ?? 0),
                'uploadSpeed' => $this->formatSpeed($user['tx-byte'] ?? 0),
            ];
        }

        // Hotspot
        $hotspotQuery = new Query('/ip/hotspot/active/print');
        $hotspotUsers = $this->client->query($hotspotQuery)->read();
        
        foreach ($hotspotUsers as $user) {
            $users[] = [
                'id' => $user['.id'] ?? '',
                'username' => $user['user'] ?? '',
                'type' => 'hotspot',
                'address' => $user['address'] ?? '',
                'uptime' => $user['uptime'] ?? '0s',
                'downloadSpeed' => $this->formatSpeed($user['bytes-in'] ?? 0),
                'uploadSpeed' => $this->formatSpeed($user['bytes-out'] ?? 0),
            ];
        }

        return $users;
    }

    public function getUserDetail(string $username, string $type = 'pppoe'): ?array
    {
        $this->ensureConnected();

        if ($type === 'pppoe') {
            $query = (new Query('/ppp/active/print'))->where('name', $username);
        } else {
            $query = (new Query('/ip/hotspot/active/print'))->where('user', $username);
        }
        
        $users = $this->client->query($query)->read();
        return !empty($users) ? $users[0] : null;
    }

    public function toggleUser(string $username, bool $enable): bool
    {
        $this->ensureConnected();

        // PPPoE
        $query = (new Query('/ppp/secret/print'))->where('name', $username);
        $secrets = $this->client->query($query)->read();

        if (!empty($secrets)) {
            $setQuery = (new Query('/ppp/secret/set'))
                ->equal('.id', $secrets[0]['.id'])
                ->equal('disabled', $enable ? 'no' : 'yes');
            $this->client->query($setQuery)->read();
            return true;
        }

        // Hotspot
        $query = (new Query('/ip/hotspot/user/print'))->where('name', $username);
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

    public function disconnectUser(string $username): bool
    {
        $this->ensureConnected();

        // PPPoE
        $query = (new Query('/ppp/active/print'))->where('name', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ppp/active/remove'))->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            return true;
        }

        // Hotspot
        $query = (new Query('/ip/hotspot/active/print'))->where('user', $username);
        $actives = $this->client->query($query)->read();

        if (!empty($actives)) {
            $removeQuery = (new Query('/ip/hotspot/active/remove'))->equal('.id', $actives[0]['.id']);
            $this->client->query($removeQuery)->read();
            return true;
        }

        return false;
    }

    public function createUser(string $username, string $password, string $profile, string $service = 'pppoe'): bool
    {
        $this->ensureConnected();

        if ($service === 'hotspot') {
            $query = (new Query('/ip/hotspot/user/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('profile', $profile);
        } else {
            $query = (new Query('/ppp/secret/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('service', $service === 'any' ? 'any' : 'pppoe')
                ->equal('profile', $profile);
        }

        $this->client->query($query)->read();
        return true;
    }

    public function updateUser(string $username, array $data, string $service = 'pppoe'): bool
    {
        $this->ensureConnected();

        if ($service === 'hotspot') {
            $query = (new Query('/ip/hotspot/user/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            $path = '/ip/hotspot/user/set';
        } else {
            $query = (new Query('/ppp/secret/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            $path = '/ppp/secret/set';
        }

        if (empty($users)) return false;

        $setQuery = new Query($path);
        $setQuery->equal('.id', $users[0]['.id']);
        foreach ($data as $key => $value) {
            $setQuery->equal($key, $value);
        }
        $this->client->query($setQuery)->read();
        return true;
    }

    public function deleteUser(string $username, string $service = 'pppoe'): bool
    {
        $this->ensureConnected();

        if ($service === 'hotspot') {
            $query = (new Query('/ip/hotspot/user/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            $path = '/ip/hotspot/user/remove';
        } else {
            $query = (new Query('/ppp/secret/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            $path = '/ppp/secret/remove';
        }

        if (empty($users)) return false;

        $removeQuery = (new Query($path))->equal('.id', $users[0]['.id']);
        $this->client->query($removeQuery)->read();
        return true;
    }

    public function importSecrets(): array
    {
        $this->ensureConnected();

        $query = new Query('/ppp/secret/print');
        $secrets = $this->client->query($query)->read();

        return array_map(fn($s) => [
            'username' => $s['name'] ?? '',
            'password' => $s['password'] ?? '',
            'service' => $s['service'] ?? 'pppoe',
            'profile' => $s['profile'] ?? '',
            'local_address' => $s['local-address'] ?? '',
            'remote_address' => $s['remote-address'] ?? '',
            'comment' => $s['comment'] ?? '',
            'disabled' => ($s['disabled'] ?? 'false') === 'true',
        ], $secrets);
    }

    public function getTraffic(): array
    {
        $this->ensureConnected();

        $query = new Query('/interface/print');
        $interfaces = $this->client->query($query)->read();

        return array_values(array_filter(array_map(function ($iface) {
            if (!isset($iface['type']) || !in_array($iface['type'], ['ether', 'pppoe-out', 'vlan', 'bridge'])) {
                return null;
            }
            return [
                'name' => $iface['name'] ?? '',
                'rx_bytes' => (int) ($iface['rx-byte'] ?? 0),
                'tx_bytes' => (int) ($iface['tx-byte'] ?? 0),
                'running' => ($iface['running'] ?? 'false') === 'true',
            ];
        }, $interfaces)));
    }

    public function syncProfile(string $name, string $rateLimit): bool
    {
        $this->ensureConnected();

        $profileName = 'profile-' . strtolower(str_replace(' ', '-', $name));

        $query = (new Query('/ppp/profile/print'))->where('name', $profileName);
        $profiles = $this->client->query($query)->read();

        if (!empty($profiles)) {
            $setQuery = (new Query('/ppp/profile/set'))
                ->equal('.id', $profiles[0]['.id'])
                ->equal('rate-limit', $rateLimit);
            $this->client->query($setQuery)->read();
        } else {
            $addQuery = (new Query('/ppp/profile/add'))
                ->equal('name', $profileName)
                ->equal('rate-limit', $rateLimit)
                ->equal('local-address', 'default')
                ->equal('remote-address', 'default');
            $this->client->query($addQuery)->read();
        }

        return true;
    }

    protected function formatSpeed($bytes): string
    {
        $bytes = (int) $bytes;
        if ($bytes >= 1073741824) {
            return round($bytes / 1073741824, 2) . ' GB';
        } elseif ($bytes >= 1048576) {
            return round($bytes / 1048576, 2) . ' MB';
        } elseif ($bytes >= 1024) {
            return round($bytes / 1024, 2) . ' KB';
        }
        return $bytes . ' B';
    }
}
```

---

## 5. Laravel Controllers

### app/Http/Controllers/Api/AuthController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'isAdmin' => $user->isAdmin(),
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:6|confirmed',
        ]);

        $isFirstUser = User::count() === 0;

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $isFirstUser ? 'admin' : 'operator',
        ]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'isAdmin' => $user->isAdmin(),
        ], 201);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user(),
            'isAdmin' => $request->user()->isAdmin(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    }
}
```

### app/Http/Controllers/Api/CustomerController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query();

        if ($request->has('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $customers = $query->orderBy('created_at', 'desc')->get();
        return response()->json($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,suspended',
        ]);

        $customer = Customer::create($validated);
        return response()->json($customer, 201);
    }

    public function show(string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        return response()->json($customer);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,suspended',
        ]);

        $customer->update($validated);
        return response()->json($customer);
    }

    public function destroy(string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $customer->delete();
        return response()->json(['message' => 'Customer deleted']);
    }

    public function subscriptions(string $id): JsonResponse
    {
        $customer = Customer::with(['subscriptions.package'])->findOrFail($id);
        return response()->json($customer->subscriptions);
    }
}
```

### app/Http/Controllers/Api/MikrotikController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MikrotikService;
use App\Models\MikrotikSecret;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class MikrotikController extends Controller
{
    public function __construct(protected MikrotikService $mikrotik) {}

    public function system(): JsonResponse
    {
        try {
            return response()->json($this->mikrotik->getSystemResource());
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function onlineUsers(): JsonResponse
    {
        try {
            return response()->json($this->mikrotik->getOnlineUsers());
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
            $result = $this->mikrotik->toggleUser($request->username, $request->enable);
            return response()->json(['success' => $result]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function disconnectUser(Request $request): JsonResponse
    {
        $request->validate(['username' => 'required|string']);

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
                MikrotikSecret::updateOrCreate(
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
            'secretId' => 'required|uuid',
        ]);

        try {
            $secret = MikrotikSecret::findOrFail($request->secretId);

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
            return response()->json($this->mikrotik->getTraffic());
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
```

---

## 6. API Routes

### routes/api.php

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
    DashboardController
};

// Public
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // Dashboard
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/expiring-soon', [DashboardController::class, 'expiringSoon']);
    Route::get('/dashboard/overdue-invoices', [DashboardController::class, 'overdueInvoices']);

    // Billing
    Route::apiResource('customers', CustomerController::class);
    Route::get('/customers/{id}/subscriptions', [CustomerController::class, 'subscriptions']);
    
    Route::apiResource('packages', PackageController::class);
    Route::post('/packages/{id}/sync-mikrotik', [PackageController::class, 'syncMikrotik']);
    
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('/subscriptions/{id}/create-mikrotik-user', [SubscriptionController::class, 'createMikrotikUser']);
    
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('/invoices/{id}/mark-paid', [InvoiceController::class, 'markPaid']);
    
    Route::apiResource('payments', PaymentController::class);

    // MikroTik
    Route::get('/router-settings', [RouterSettingController::class, 'index']);
    Route::post('/router-settings', [RouterSettingController::class, 'store']);
    Route::put('/router-settings/{id}', [RouterSettingController::class, 'update']);
    Route::post('/router-settings/{id}/test', [RouterSettingController::class, 'test']);

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

    Route::apiResource('mikrotik-secrets', MikrotikSecretController::class);
});
```

---

## 7. Frontend API Client

Buat file baru di frontend untuk menggantikan Supabase calls:

### src/lib/api.ts

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiClient {
  private token: string | null = null;

  // ==========================================
  // TOKEN MANAGEMENT
  // ==========================================

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ==========================================
  // BASE REQUEST METHOD
  // ==========================================

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/auth';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'API Error' }));
      throw new Error(error.message || error.error || 'API Error');
    }

    return response.json();
  }

  // ==========================================
  // AUTH
  // ==========================================

  async login(email: string, password: string) {
    const data = await this.request<{ user: any; token: string; isAdmin: boolean }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(name: string, email: string, password: string, password_confirmation: string) {
    const data = await this.request<{ user: any; token: string; isAdmin: boolean }>('/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, password_confirmation }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.request('/logout', { method: 'POST' });
    this.clearToken();
  }

  async getUser() {
    return this.request<{ user: any; isAdmin: boolean }>('/user');
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  async getDashboardStats() {
    return this.request<{
      customersCount: number;
      activeSubscriptions: number;
      unpaidInvoices: number;
      monthlyRevenue: number;
    }>('/dashboard/stats');
  }

  async getExpiringSoon() {
    return this.request<any[]>('/dashboard/expiring-soon');
  }

  async getOverdueInvoices() {
    return this.request<any[]>('/dashboard/overdue-invoices');
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================

  async getCustomers(params?: { status?: string; search?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any[]>(`/customers${query ? `?${query}` : ''}`);
  }

  async getCustomer(id: string) {
    return this.request<any>(`/customers/${id}`);
  }

  async createCustomer(data: any) {
    return this.request<any>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: string, data: any) {
    return this.request<any>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomer(id: string) {
    return this.request(`/customers/${id}`, { method: 'DELETE' });
  }

  // ==========================================
  // PACKAGES
  // ==========================================

  async getPackages() {
    return this.request<any[]>('/packages');
  }

  async createPackage(data: any) {
    return this.request<any>('/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePackage(id: string, data: any) {
    return this.request<any>(`/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePackage(id: string) {
    return this.request(`/packages/${id}`, { method: 'DELETE' });
  }

  async syncPackageToMikrotik(id: string) {
    return this.request(`/packages/${id}/sync-mikrotik`, { method: 'POST' });
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  async getSubscriptions() {
    return this.request<any[]>('/subscriptions');
  }

  async createSubscription(data: any) {
    return this.request<any>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubscription(id: string, data: any) {
    return this.request<any>(`/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSubscription(id: string) {
    return this.request(`/subscriptions/${id}`, { method: 'DELETE' });
  }

  async createMikrotikUser(subscriptionId: string) {
    return this.request(`/subscriptions/${subscriptionId}/create-mikrotik-user`, { method: 'POST' });
  }

  // ==========================================
  // INVOICES
  // ==========================================

  async getInvoices() {
    return this.request<any[]>('/invoices');
  }

  async createInvoice(data: any) {
    return this.request<any>('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInvoice(id: string, data: any) {
    return this.request<any>(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInvoice(id: string) {
    return this.request(`/invoices/${id}`, { method: 'DELETE' });
  }

  async markInvoicePaid(id: string, paymentData: any) {
    return this.request(`/invoices/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  // ==========================================
  // PAYMENTS
  // ==========================================

  async getPayments() {
    return this.request<any[]>('/payments');
  }

  async createPayment(data: any) {
    return this.request<any>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==========================================
  // ROUTER SETTINGS
  // ==========================================

  async getRouterSettings() {
    return this.request<any>('/router-settings');
  }

  async saveRouterSettings(data: any) {
    return this.request<any>('/router-settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRouterSettings(id: string, data: any) {
    return this.request<any>(`/router-settings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async testRouterConnection(id: string) {
    return this.request(`/router-settings/${id}/test`, { method: 'POST' });
  }

  // ==========================================
  // MIKROTIK
  // ==========================================

  async getMikrotikSystem() {
    return this.request<{
      cpu: number;
      memory: number;
      uptime: string;
      version: string;
      board: string;
      temperature: number | null;
    }>('/mikrotik/system');
  }

  async getMikrotikOnlineUsers() {
    return this.request<any[]>('/mikrotik/online-users');
  }

  async getMikrotikUserDetail(username: string, type: string = 'pppoe') {
    return this.request<any>(`/mikrotik/user-detail/${username}?type=${type}`);
  }

  async toggleMikrotikUser(username: string, enable: boolean) {
    return this.request<{ success: boolean }>('/mikrotik/toggle-user', {
      method: 'POST',
      body: JSON.stringify({ username, enable }),
    });
  }

  async disconnectMikrotikUser(username: string) {
    return this.request<{ success: boolean }>('/mikrotik/disconnect-user', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async importMikrotikSecrets() {
    return this.request<{ success: boolean; imported: number }>('/mikrotik/import-secrets', {
      method: 'POST',
    });
  }

  async syncMikrotikSecret(action: 'create' | 'update' | 'delete', secretId: string) {
    return this.request<{ success: boolean }>('/mikrotik/sync-secret', {
      method: 'POST',
      body: JSON.stringify({ action, secretId }),
    });
  }

  async getMikrotikTraffic() {
    return this.request<any[]>('/mikrotik/traffic');
  }

  // ==========================================
  // MIKROTIK SECRETS
  // ==========================================

  async getMikrotikSecrets() {
    return this.request<any[]>('/mikrotik-secrets');
  }

  async createMikrotikSecret(data: any) {
    return this.request<any>('/mikrotik-secrets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMikrotikSecret(id: string, data: any) {
    return this.request<any>(`/mikrotik-secrets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMikrotikSecret(id: string) {
    return this.request(`/mikrotik-secrets/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
```

---

## 8. Frontend Component Changes

### Environment Variable

Tambahkan di `.env` frontend:

```env
VITE_API_URL=http://localhost:8000/api
```

### Contoh Perubahan Component

**BEFORE (Supabase):**
```typescript
import { supabase } from "@/integrations/supabase/client";

const fetchOnlineUsers = async () => {
  const { data, error } = await supabase.functions.invoke("mikrotik-online-users");
  if (error) throw error;
  setUsers(data || []);
};
```

**AFTER (Laravel API):**
```typescript
import { api } from "@/lib/api";

const fetchOnlineUsers = async () => {
  try {
    const data = await api.getMikrotikOnlineUsers();
    setUsers(data || []);
  } catch (error: any) {
    toast.error(error.message);
  }
};
```

### Full Migration Map

| Component | Supabase Call | Laravel API Call |
|-----------|---------------|------------------|
| OnlineUsers.tsx | `supabase.functions.invoke("mikrotik-online-users")` | `api.getMikrotikOnlineUsers()` |
| SystemStats.tsx | `supabase.functions.invoke("mikrotik-system")` | `api.getMikrotikSystem()` |
| TrafficGraph.tsx | `supabase.functions.invoke("mikrotik-traffic")` | `api.getMikrotikTraffic()` |
| CustomerList.tsx | `supabase.from("customers").select()` | `api.getCustomers()` |
| SecretList.tsx | `supabase.from("mikrotik_secrets").select()` | `api.getMikrotikSecrets()` |
| RouterSettings.tsx | `supabase.from("router_settings").select()` | `api.getRouterSettings()` |
| Dashboard.tsx | Multiple Supabase queries | `api.getDashboardStats()`, etc. |
| useAuth.tsx | `supabase.auth.*` | `api.login()`, `api.getUser()`, etc. |

---

## 9. Authentication Migration

### src/hooks/useAuth.tsx (Updated)

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, passwordConfirmation: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    if (!api.isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      const { user, isAdmin } = await api.getUser();
      setUser(user);
      setIsAdmin(isAdmin);
    } catch (error) {
      api.clearToken();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const { user, isAdmin } = await api.login(email, password);
    setUser(user);
    setIsAdmin(isAdmin);
    navigate('/');
  };

  const register = async (name: string, email: string, password: string, passwordConfirmation: string) => {
    const { user, isAdmin } = await api.register(name, email, password, passwordConfirmation);
    setUser(user);
    setIsAdmin(isAdmin);
    navigate('/');
  };

  const signOut = async () => {
    await api.logout();
    setUser(null);
    setIsAdmin(false);
    navigate('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
```

---

## 10. Deployment Guide

### Laravel Backend

```bash
# Server setup
sudo apt update
sudo apt install nginx mysql-server php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-snmp

# Clone & setup
cd /var/www
git clone your-repo.git isp-billing
cd isp-billing
composer install --no-dev --optimize-autoloader

# Environment
cp .env.example .env
php artisan key:generate
# Edit .env with production values

# Database
php artisan migrate --force

# Permissions
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

# Optimize
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Nginx Config

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    root /var/www/isp-billing/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

### Supervisor untuk Background Jobs

```ini
[program:isp-queue]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/isp-billing/artisan queue:work --sleep=3 --tries=3
autostart=true
autorestart=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/supervisor/isp-queue.log
```

### Crontab untuk Scheduler

```bash
* * * * * cd /var/www/isp-billing && php artisan schedule:run >> /dev/null 2>&1
```

---

## Summary

Dokumentasi ini mencakup:

1. ✅ Complete MySQL schema (billing + monitoring)
2. ✅ Laravel 11/12 Models with UUID
3. ✅ MikrotikService (RouterOS v6 compatible)
4. ✅ All API Controllers
5. ✅ Complete API Routes
6. ✅ Frontend API Client (`src/lib/api.ts`)
7. ✅ Component migration guide
8. ✅ Auth migration (Supabase → Sanctum)
9. ✅ Deployment guide

**Next Steps:**
1. Setup Laravel project
2. Import database schema
3. Add `src/lib/api.ts` to frontend
4. Update frontend components satu per satu
5. Test & deploy
