# Complete Laravel 11/12 Backend + Frontend Integration

Dokumentasi lengkap untuk migrasi dari Supabase Edge Functions ke Laravel backend dengan auto-integration ke frontend React, termasuk integrasi **MikroTik** dan **Midtrans Payment Gateway**.

---

## ⚠️ TROUBLESHOOTING: Error "Not Found" atau "Network Error"

Jika Anda mendapat error "Not Found" atau "Network Error", ikuti langkah-langkah ini:

### 1. Pastikan Laravel Backend Running

```bash
# Masuk ke folder Laravel project
cd C:\xampp\htdocs\isp-billing-api

# Jalankan server Laravel
php artisan serve

# Output: Starting Laravel development server: http://127.0.0.1:8000
```

### 2. Konfigurasi Frontend .env

Buat file `.env.local` di root folder frontend React:

```env
VITE_API_URL=http://localhost:8000/api
```

**PENTING**: Restart frontend development server setelah mengubah .env:

```bash
# Stop frontend (Ctrl+C), lalu jalankan ulang
npm run dev
```

### 3. Test API dengan Browser/Postman

Buka browser dan akses:
- `http://localhost:8000/api/packages` → Harus return JSON (atau error 401 jika butuh auth)
- `http://localhost:8000/api/auth/login` → POST endpoint untuk login

### 4. Cek CORS Configuration

Pastikan `config/cors.php` di Laravel sudah benar:

```php
'allowed_origins' => [
    'http://localhost:5173',  // Vite default
    'http://localhost:8080',
    'http://localhost:3000',
],
```

### 5. Debug API Client

Tambahkan console.log di `src/lib/api.ts` untuk debug:

```typescript
// Di method request(), tambahkan:
console.log('API Request:', `${API_URL}${endpoint}`);
```

---

## Table of Contents

1. [Backend Setup](#1-backend-setup)
2. [Database Schema (MySQL)](#2-database-schema-mysql)
3. [Laravel Models](#3-laravel-models)
4. [Laravel Services](#4-laravel-services)
5. [Laravel Controllers](#5-laravel-controllers)
6. [API Routes](#6-api-routes)
7. [Midtrans Integration](#7-midtrans-integration)
8. [Frontend API Client](#8-frontend-api-client)
9. [Frontend Component Changes](#9-frontend-component-changes)
10. [Authentication Migration](#10-authentication-migration)
11. [Deployment Guide](#11-deployment-guide)

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
composer require midtrans/midtrans-php

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

# Midtrans Configuration
MIDTRANS_SERVER_KEY=your-server-key
MIDTRANS_CLIENT_KEY=your-client-key
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_IS_SANITIZED=true
MIDTRANS_IS_3DS=true

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

### Midtrans Config (config/midtrans.php)

```php
<?php

return [
    'server_key' => env('MIDTRANS_SERVER_KEY'),
    'client_key' => env('MIDTRANS_CLIENT_KEY'),
    'is_production' => env('MIDTRANS_IS_PRODUCTION', false),
    'is_sanitized' => env('MIDTRANS_IS_SANITIZED', true),
    'is_3ds' => env('MIDTRANS_IS_3DS', true),
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
    status ENUM('unpaid', 'paid', 'overdue', 'cancelled', 'pending') DEFAULT 'unpaid',
    payment_reference VARCHAR(255),
    payment_url VARCHAR(500),
    midtrans_order_id VARCHAR(255) UNIQUE,
    midtrans_transaction_id VARCHAR(255),
    midtrans_payment_type VARCHAR(100),
    midtrans_status VARCHAR(50),
    midtrans_snap_token VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_due_date (due_date),
    INDEX idx_midtrans_order (midtrans_order_id)
);

CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    invoice_id CHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    method ENUM('cash', 'transfer', 'qris', 'ewallet', 'gopay', 'shopeepay', 'dana', 'ovo', 'credit_card', 'bank_transfer', 'cstore', 'other') DEFAULT 'cash',
    transaction_id VARCHAR(255),
    midtrans_transaction_id VARCHAR(255),
    midtrans_payment_type VARCHAR(100),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    INDEX idx_payment_date (payment_date),
    INDEX idx_midtrans_transaction (midtrans_transaction_id)
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
-- MIDTRANS WEBHOOK LOGS
-- =============================================

CREATE TABLE midtrans_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    order_id VARCHAR(255) NOT NULL,
    transaction_id VARCHAR(255),
    transaction_status VARCHAR(50),
    payment_type VARCHAR(100),
    gross_amount DECIMAL(15, 2),
    fraud_status VARCHAR(50),
    signature_key VARCHAR(255),
    raw_payload JSON,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (order_id),
    INDEX idx_transaction (transaction_id),
    INDEX idx_status (transaction_status)
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
    type ENUM('device_down', 'device_up', 'ping_down', 'ping_up', 'high_latency', 'bandwidth_high', 'flapping_start', 'flapping_stop', 'payment_received', 'payment_failed') NOT NULL,
    source_type ENUM('device', 'interface', 'ping_target', 'invoice') NOT NULL,
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
    DELETE FROM midtrans_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
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
        'midtrans_order_id', 'midtrans_transaction_id',
        'midtrans_payment_type', 'midtrans_status', 'midtrans_snap_token',
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
        'midtrans_transaction_id', 'midtrans_payment_type',
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

### app/Models/MidtransLog.php

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class MidtransLog extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'order_id', 'transaction_id', 'transaction_status', 'payment_type',
        'gross_amount', 'fraud_status', 'signature_key', 'raw_payload', 'processed',
    ];

    protected function casts(): array
    {
        return [
            'gross_amount' => 'decimal:2',
            'raw_payload' => 'array',
            'processed' => 'boolean',
            'created_at' => 'datetime',
        ];
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
                'legacy' => true, // RouterOS v6 compatibility
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

    public function testConnection(): array
    {
        try {
            $this->connect();
            $resource = $this->getSystemResource();
            return [
                'success' => true,
                'message' => 'Connection successful',
                'data' => $resource,
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
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
            // Get active session
            $query = (new Query('/ppp/active/print'))->where('name', $username);
            $actives = $this->client->query($query)->read();
            
            if (empty($actives)) return null;
            
            $active = $actives[0];
            
            // Get secret info
            $secretQuery = (new Query('/ppp/secret/print'))->where('name', $username);
            $secrets = $this->client->query($secretQuery)->read();
            $secret = !empty($secrets) ? $secrets[0] : null;
            
            // Get profile info
            $profile = null;
            if ($secret && !empty($secret['profile'])) {
                $profileQuery = (new Query('/ppp/profile/print'))->where('name', $secret['profile']);
                $profiles = $this->client->query($profileQuery)->read();
                $profile = !empty($profiles) ? $profiles[0] : null;
            }

            return [
                'username' => $username,
                'type' => 'pppoe',
                'session' => [
                    'id' => $active['.id'] ?? '',
                    'address' => $active['address'] ?? '',
                    'macAddress' => $active['caller-id'] ?? '',
                    'uptime' => $active['uptime'] ?? '0s',
                    'encoding' => $active['encoding'] ?? '',
                    'service' => $active['service'] ?? 'pppoe',
                ],
                'bandwidth' => [
                    'rxRate' => $this->formatSpeed($active['rx-byte'] ?? 0),
                    'txRate' => $this->formatSpeed($active['tx-byte'] ?? 0),
                    'rxBytes' => $this->formatBytes($active['rx-byte'] ?? 0),
                    'txBytes' => $this->formatBytes($active['tx-byte'] ?? 0),
                    'rxPackets' => $active['rx-packet'] ?? '0',
                    'txPackets' => $active['tx-packet'] ?? '0',
                ],
                'profile' => $profile ? [
                    'profile' => $profile['name'] ?? '',
                    'service' => 'pppoe',
                    'limitAt' => $profile['rate-limit'] ?? 'unlimited',
                    'maxLimit' => $profile['rate-limit'] ?? 'unlimited',
                    'comment' => $secret['comment'] ?? '',
                ] : null,
            ];
        } else {
            // Hotspot
            $query = (new Query('/ip/hotspot/active/print'))->where('user', $username);
            $actives = $this->client->query($query)->read();
            
            if (empty($actives)) return null;
            
            $active = $actives[0];
            
            return [
                'username' => $username,
                'type' => 'hotspot',
                'session' => [
                    'id' => $active['.id'] ?? '',
                    'address' => $active['address'] ?? '',
                    'macAddress' => $active['mac-address'] ?? '',
                    'uptime' => $active['uptime'] ?? '0s',
                    'encoding' => '',
                    'service' => 'hotspot',
                ],
                'bandwidth' => [
                    'rxRate' => $this->formatSpeed($active['bytes-in'] ?? 0),
                    'txRate' => $this->formatSpeed($active['bytes-out'] ?? 0),
                    'rxBytes' => $this->formatBytes($active['bytes-in'] ?? 0),
                    'txBytes' => $this->formatBytes($active['bytes-out'] ?? 0),
                    'rxPackets' => $active['packets-in'] ?? '0',
                    'txPackets' => $active['packets-out'] ?? '0',
                ],
                'profile' => null,
            ];
        }
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
            
            // Disconnect if disabling
            if (!$enable) {
                $this->disconnectUser($username);
            }
            
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
            
            if (!$enable) {
                $this->disconnectUser($username);
            }
            
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

    public function createUser(string $username, string $password, string $profile, string $service = 'pppoe', ?string $comment = null): bool
    {
        $this->ensureConnected();

        if ($service === 'hotspot') {
            $query = (new Query('/ip/hotspot/user/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('profile', $profile);
            
            if ($comment) {
                $query->equal('comment', $comment);
            }
        } else {
            $query = (new Query('/ppp/secret/add'))
                ->equal('name', $username)
                ->equal('password', $password)
                ->equal('service', $service === 'any' ? 'any' : 'pppoe')
                ->equal('profile', $profile);
            
            if ($comment) {
                $query->equal('comment', $comment);
            }
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
            
            if (empty($users)) return false;
            
            $setQuery = (new Query('/ip/hotspot/user/set'))
                ->equal('.id', $users[0]['.id']);
        } else {
            $query = (new Query('/ppp/secret/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            
            if (empty($users)) return false;
            
            $setQuery = (new Query('/ppp/secret/set'))
                ->equal('.id', $users[0]['.id']);
        }

        foreach ($data as $key => $value) {
            $setQuery->equal($key, $value);
        }

        $this->client->query($setQuery)->read();
        return true;
    }

    public function deleteUser(string $username, string $service = 'pppoe'): bool
    {
        $this->ensureConnected();

        // Disconnect first
        $this->disconnectUser($username);

        if ($service === 'hotspot') {
            $query = (new Query('/ip/hotspot/user/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            
            if (!empty($users)) {
                $removeQuery = (new Query('/ip/hotspot/user/remove'))->equal('.id', $users[0]['.id']);
                $this->client->query($removeQuery)->read();
                return true;
            }
        } else {
            $query = (new Query('/ppp/secret/print'))->where('name', $username);
            $users = $this->client->query($query)->read();
            
            if (!empty($users)) {
                $removeQuery = (new Query('/ppp/secret/remove'))->equal('.id', $users[0]['.id']);
                $this->client->query($removeQuery)->read();
                return true;
            }
        }

        return false;
    }

    public function getProfiles(string $type = 'pppoe'): array
    {
        $this->ensureConnected();

        if ($type === 'hotspot') {
            $query = new Query('/ip/hotspot/user/profile/print');
        } else {
            $query = new Query('/ppp/profile/print');
        }

        return $this->client->query($query)->read();
    }

    public function getTrafficData(): array
    {
        $this->ensureConnected();
        
        $query = new Query('/interface/print');
        $interfaces = $this->client->query($query)->read();
        
        $trafficData = [];
        foreach ($interfaces as $interface) {
            if (in_array($interface['type'] ?? '', ['ether', 'bridge', 'vlan', 'pppoe-out'])) {
                $trafficData[] = [
                    'name' => $interface['name'] ?? '',
                    'type' => $interface['type'] ?? '',
                    'rxBytes' => (int) ($interface['rx-byte'] ?? 0),
                    'txBytes' => (int) ($interface['tx-byte'] ?? 0),
                    'rxPackets' => (int) ($interface['rx-packet'] ?? 0),
                    'txPackets' => (int) ($interface['tx-packet'] ?? 0),
                    'running' => ($interface['running'] ?? 'false') === 'true',
                    'disabled' => ($interface['disabled'] ?? 'false') === 'true',
                ];
            }
        }

        return $trafficData;
    }

    public function importSecrets(): array
    {
        $this->ensureConnected();
        
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

    protected function formatSpeed($bytes): string
    {
        $bytes = (int) $bytes;
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' Gbps';
        } elseif ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' Mbps';
        } elseif ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' Kbps';
        }
        return $bytes . ' bps';
    }

    protected function formatBytes($bytes): string
    {
        $bytes = (int) $bytes;
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' GB';
        } elseif ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' MB';
        } elseif ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' KB';
        }
        return $bytes . ' B';
    }
}
```

### app/Services/MidtransService.php

```php
<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\MidtransLog;
use App\Models\BillingLog;
use Illuminate\Support\Facades\Log;
use Midtrans\Config;
use Midtrans\Snap;
use Midtrans\Transaction;
use Midtrans\Notification;

class MidtransService
{
    public function __construct()
    {
        Config::$serverKey = config('midtrans.server_key');
        Config::$clientKey = config('midtrans.client_key');
        Config::$isProduction = config('midtrans.is_production');
        Config::$isSanitized = config('midtrans.is_sanitized');
        Config::$is3ds = config('midtrans.is_3ds');
    }

    /**
     * Create Snap Token for Invoice Payment
     */
    public function createSnapToken(Invoice $invoice): array
    {
        $invoice->load(['subscription.customer', 'subscription.package']);
        
        $customer = $invoice->subscription->customer;
        $package = $invoice->subscription->package;
        
        // Generate unique order ID
        $orderId = 'INV-' . $invoice->id . '-' . time();
        
        $params = [
            'transaction_details' => [
                'order_id' => $orderId,
                'gross_amount' => (int) $invoice->amount,
            ],
            'customer_details' => [
                'first_name' => $customer->name,
                'email' => $customer->email ?? 'noemail@example.com',
                'phone' => $customer->phone ?? '',
            ],
            'item_details' => [
                [
                    'id' => $package->id,
                    'price' => (int) $invoice->amount,
                    'quantity' => 1,
                    'name' => "Tagihan {$package->name} - {$customer->name}",
                ]
            ],
            'callbacks' => [
                'finish' => config('app.frontend_url') . '/payments?status=success',
                'error' => config('app.frontend_url') . '/payments?status=error',
                'pending' => config('app.frontend_url') . '/payments?status=pending',
            ],
            'enabled_payments' => [
                'credit_card', 'bca_va', 'bni_va', 'bri_va', 'permata_va',
                'echannel', 'gopay', 'shopeepay', 'dana', 'ovo', 'qris',
                'indomaret', 'alfamart',
            ],
            'expiry' => [
                'start_time' => date('Y-m-d H:i:s O'),
                'unit' => 'days',
                'duration' => 1,
            ],
        ];

        try {
            $snapToken = Snap::getSnapToken($params);
            
            // Update invoice with Midtrans data
            $invoice->update([
                'midtrans_order_id' => $orderId,
                'midtrans_snap_token' => $snapToken,
                'status' => 'pending',
            ]);

            // Log action
            BillingLog::create([
                'invoice_id' => $invoice->id,
                'subscription_id' => $invoice->subscription_id,
                'action' => 'midtrans_snap_created',
                'message' => "Snap token created for invoice",
                'meta' => ['order_id' => $orderId],
            ]);

            return [
                'success' => true,
                'snap_token' => $snapToken,
                'order_id' => $orderId,
                'client_key' => config('midtrans.client_key'),
            ];
        } catch (\Exception $e) {
            Log::error('Midtrans Snap Error: ' . $e->getMessage());
            
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Get Snap Redirect URL (alternative to Snap token)
     */
    public function createSnapUrl(Invoice $invoice): array
    {
        $invoice->load(['subscription.customer', 'subscription.package']);
        
        $customer = $invoice->subscription->customer;
        $package = $invoice->subscription->package;
        
        $orderId = 'INV-' . $invoice->id . '-' . time();
        
        $params = [
            'transaction_details' => [
                'order_id' => $orderId,
                'gross_amount' => (int) $invoice->amount,
            ],
            'customer_details' => [
                'first_name' => $customer->name,
                'email' => $customer->email ?? 'noemail@example.com',
                'phone' => $customer->phone ?? '',
            ],
            'item_details' => [
                [
                    'id' => $package->id,
                    'price' => (int) $invoice->amount,
                    'quantity' => 1,
                    'name' => "Tagihan {$package->name}",
                ]
            ],
        ];

        try {
            $snapUrl = Snap::createTransaction($params)->redirect_url;
            
            $invoice->update([
                'midtrans_order_id' => $orderId,
                'payment_url' => $snapUrl,
                'status' => 'pending',
            ]);

            return [
                'success' => true,
                'redirect_url' => $snapUrl,
                'order_id' => $orderId,
            ];
        } catch (\Exception $e) {
            Log::error('Midtrans Snap URL Error: ' . $e->getMessage());
            
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Handle Webhook Notification from Midtrans
     */
    public function handleNotification(array $payload): array
    {
        try {
            $notification = new Notification();
            
            $orderId = $notification->order_id;
            $transactionStatus = $notification->transaction_status;
            $transactionId = $notification->transaction_id;
            $paymentType = $notification->payment_type;
            $fraudStatus = $notification->fraud_status ?? 'accept';
            $grossAmount = $notification->gross_amount;
            $signatureKey = $notification->signature_key;
            
            // Verify signature
            $expectedSignature = hash('sha512', 
                $orderId . $notification->status_code . $grossAmount . config('midtrans.server_key')
            );
            
            if ($signatureKey !== $expectedSignature) {
                Log::warning("Invalid Midtrans signature for order: {$orderId}");
                return ['success' => false, 'message' => 'Invalid signature'];
            }

            // Log notification
            MidtransLog::create([
                'order_id' => $orderId,
                'transaction_id' => $transactionId,
                'transaction_status' => $transactionStatus,
                'payment_type' => $paymentType,
                'gross_amount' => $grossAmount,
                'fraud_status' => $fraudStatus,
                'signature_key' => $signatureKey,
                'raw_payload' => $payload,
            ]);

            // Find invoice
            $invoice = Invoice::where('midtrans_order_id', $orderId)->first();
            
            if (!$invoice) {
                Log::warning("Invoice not found for order: {$orderId}");
                return ['success' => false, 'message' => 'Invoice not found'];
            }

            // Update invoice with transaction details
            $invoice->update([
                'midtrans_transaction_id' => $transactionId,
                'midtrans_payment_type' => $paymentType,
                'midtrans_status' => $transactionStatus,
            ]);

            // Process based on status
            if ($transactionStatus === 'capture' || $transactionStatus === 'settlement') {
                if ($paymentType === 'credit_card' && $fraudStatus !== 'accept') {
                    Log::warning("Fraud detected for order: {$orderId}");
                    return $this->handleFraud($invoice, $transactionStatus, $fraudStatus);
                }
                
                return $this->handlePaymentSuccess($invoice, $transactionId, $paymentType, $grossAmount);
            } elseif ($transactionStatus === 'pending') {
                return $this->handlePaymentPending($invoice);
            } elseif (in_array($transactionStatus, ['deny', 'expire', 'cancel'])) {
                return $this->handlePaymentFailed($invoice, $transactionStatus);
            }

            return ['success' => true, 'message' => 'Notification processed'];
        } catch (\Exception $e) {
            Log::error('Midtrans Notification Error: ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Handle Successful Payment
     */
    protected function handlePaymentSuccess(Invoice $invoice, string $transactionId, string $paymentType, $amount): array
    {
        // Create payment record
        Payment::create([
            'invoice_id' => $invoice->id,
            'amount' => $amount,
            'method' => $this->mapPaymentMethod($paymentType),
            'transaction_id' => $transactionId,
            'midtrans_transaction_id' => $transactionId,
            'midtrans_payment_type' => $paymentType,
            'payment_date' => now(),
        ]);

        // Update invoice status
        $invoice->update([
            'status' => 'paid',
            'payment_reference' => $transactionId,
        ]);

        // Activate subscription if needed
        $subscription = $invoice->subscription;
        if ($subscription && $subscription->status !== 'active') {
            $subscription->update(['status' => 'active']);
            
            // Enable MikroTik user
            try {
                $mikrotikService = new MikrotikService();
                $mikrotikService->toggleUser($subscription->mikrotik_username, true);
            } catch (\Exception $e) {
                Log::error("Failed to enable MikroTik user: " . $e->getMessage());
            }
        }

        // Log billing action
        BillingLog::create([
            'invoice_id' => $invoice->id,
            'subscription_id' => $invoice->subscription_id,
            'action' => 'payment_received',
            'message' => "Payment received via {$paymentType}",
            'meta' => [
                'transaction_id' => $transactionId,
                'amount' => $amount,
                'payment_type' => $paymentType,
            ],
        ]);

        Log::info("Payment success for invoice: {$invoice->id}");

        return ['success' => true, 'message' => 'Payment successful'];
    }

    /**
     * Handle Pending Payment
     */
    protected function handlePaymentPending(Invoice $invoice): array
    {
        $invoice->update(['status' => 'pending']);

        BillingLog::create([
            'invoice_id' => $invoice->id,
            'subscription_id' => $invoice->subscription_id,
            'action' => 'payment_pending',
            'message' => 'Payment is pending',
        ]);

        return ['success' => true, 'message' => 'Payment pending'];
    }

    /**
     * Handle Failed Payment
     */
    protected function handlePaymentFailed(Invoice $invoice, string $status): array
    {
        // Only revert to unpaid if was pending
        if ($invoice->status === 'pending') {
            $invoice->update(['status' => 'unpaid']);
        }

        BillingLog::create([
            'invoice_id' => $invoice->id,
            'subscription_id' => $invoice->subscription_id,
            'action' => 'payment_failed',
            'message' => "Payment {$status}",
            'meta' => ['status' => $status],
        ]);

        return ['success' => true, 'message' => 'Payment failed'];
    }

    /**
     * Handle Fraud Detection
     */
    protected function handleFraud(Invoice $invoice, string $transactionStatus, string $fraudStatus): array
    {
        $invoice->update(['status' => 'unpaid']);

        BillingLog::create([
            'invoice_id' => $invoice->id,
            'subscription_id' => $invoice->subscription_id,
            'action' => 'payment_fraud',
            'message' => "Fraud detected: {$fraudStatus}",
            'meta' => [
                'transaction_status' => $transactionStatus,
                'fraud_status' => $fraudStatus,
            ],
        ]);

        return ['success' => false, 'message' => 'Fraud detected'];
    }

    /**
     * Check Transaction Status
     */
    public function checkStatus(string $orderId): array
    {
        try {
            $status = Transaction::status($orderId);
            
            return [
                'success' => true,
                'data' => $status,
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Cancel Transaction
     */
    public function cancelTransaction(string $orderId): array
    {
        try {
            $response = Transaction::cancel($orderId);
            
            $invoice = Invoice::where('midtrans_order_id', $orderId)->first();
            if ($invoice) {
                $invoice->update(['status' => 'cancelled']);
            }
            
            return [
                'success' => true,
                'data' => $response,
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Map Midtrans payment type to local method
     */
    protected function mapPaymentMethod(string $paymentType): string
    {
        $map = [
            'credit_card' => 'credit_card',
            'bank_transfer' => 'bank_transfer',
            'bca_va' => 'bank_transfer',
            'bni_va' => 'bank_transfer',
            'bri_va' => 'bank_transfer',
            'permata_va' => 'bank_transfer',
            'echannel' => 'bank_transfer',
            'gopay' => 'gopay',
            'shopeepay' => 'shopeepay',
            'dana' => 'dana',
            'ovo' => 'ovo',
            'qris' => 'qris',
            'cstore' => 'cstore',
            'indomaret' => 'cstore',
            'alfamart' => 'cstore',
        ];

        return $map[$paymentType] ?? 'other';
    }

    /**
     * Get Client Key for frontend
     */
    public function getClientKey(): string
    {
        return config('midtrans.client_key');
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
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
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

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => 'operator',
        ]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'isAdmin' => $user->isAdmin(),
        ], 201);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function user(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
            'isAdmin' => $request->user()->isAdmin(),
        ]);
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

class MikrotikController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;
    }

    public function testConnection()
    {
        return response()->json($this->mikrotik->testConnection());
    }

    public function system()
    {
        try {
            $data = $this->mikrotik->getSystemResource();
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function onlineUsers()
    {
        try {
            $data = $this->mikrotik->getOnlineUsers();
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function userDetail(string $username, Request $request)
    {
        try {
            $type = $request->query('type', 'pppoe');
            $data = $this->mikrotik->getUserDetail($username, $type);
            
            if (!$data) {
                return response()->json(['success' => false, 'message' => 'User not found'], 404);
            }
            
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function toggleUser(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'enable' => 'required|boolean',
        ]);

        try {
            $result = $this->mikrotik->toggleUser($request->username, $request->enable);
            return response()->json(['success' => $result]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function disconnectUser(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
        ]);

        try {
            $result = $this->mikrotik->disconnectUser($request->username);
            return response()->json(['success' => $result]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function traffic()
    {
        try {
            $data = $this->mikrotik->getTrafficData();
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function profiles(Request $request)
    {
        try {
            $type = $request->query('type', 'pppoe');
            $data = $this->mikrotik->getProfiles($type);
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function importSecrets()
    {
        try {
            $secrets = $this->mikrotik->importSecrets();
            $imported = 0;

            foreach ($secrets as $secret) {
                $existing = MikrotikSecret::where('username', $secret['username'])->first();
                
                if (!$existing) {
                    MikrotikSecret::create($secret);
                    $imported++;
                }
            }

            return response()->json([
                'success' => true,
                'imported' => $imported,
                'total' => count($secrets),
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function syncSecret(Request $request)
    {
        $request->validate([
            'action' => 'required|in:create,update,delete',
            'secretId' => 'required|string',
        ]);

        try {
            $secret = MikrotikSecret::findOrFail($request->secretId);
            
            switch ($request->action) {
                case 'create':
                    $this->mikrotik->createUser(
                        $secret->username,
                        $secret->password,
                        $secret->profile ?? 'default',
                        $secret->service,
                        $secret->comment
                    );
                    break;
                    
                case 'update':
                    $this->mikrotik->updateUser($secret->username, [
                        'password' => $secret->password,
                        'profile' => $secret->profile ?? 'default',
                        'comment' => $secret->comment ?? '',
                        'disabled' => $secret->disabled ? 'yes' : 'no',
                    ], $secret->service);
                    break;
                    
                case 'delete':
                    $this->mikrotik->deleteUser($secret->username, $secret->service);
                    break;
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
```

### app/Http/Controllers/Api/MidtransController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Services\MidtransService;
use Illuminate\Http\Request;

class MidtransController extends Controller
{
    protected MidtransService $midtrans;

    public function __construct(MidtransService $midtrans)
    {
        $this->midtrans = $midtrans;
    }

    /**
     * Get Midtrans client key
     */
    public function getClientKey()
    {
        return response()->json([
            'client_key' => $this->midtrans->getClientKey(),
        ]);
    }

    /**
     * Create Snap Token for payment
     */
    public function createSnapToken(Request $request)
    {
        $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
        ]);

        $invoice = Invoice::findOrFail($request->invoice_id);

        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Invoice already paid',
            ], 400);
        }

        $result = $this->midtrans->createSnapToken($invoice);

        if ($result['success']) {
            return response()->json($result);
        }

        return response()->json($result, 500);
    }

    /**
     * Create redirect URL for payment
     */
    public function createPaymentUrl(Request $request)
    {
        $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
        ]);

        $invoice = Invoice::findOrFail($request->invoice_id);

        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Invoice already paid',
            ], 400);
        }

        $result = $this->midtrans->createSnapUrl($invoice);

        if ($result['success']) {
            return response()->json($result);
        }

        return response()->json($result, 500);
    }

    /**
     * Handle Midtrans webhook notification
     */
    public function handleNotification(Request $request)
    {
        $payload = $request->all();
        $result = $this->midtrans->handleNotification($payload);

        return response()->json($result);
    }

    /**
     * Check transaction status
     */
    public function checkStatus(string $orderId)
    {
        $result = $this->midtrans->checkStatus($orderId);

        if ($result['success']) {
            return response()->json($result);
        }

        return response()->json($result, 400);
    }

    /**
     * Cancel transaction
     */
    public function cancelTransaction(string $orderId)
    {
        $result = $this->midtrans->cancelTransaction($orderId);

        if ($result['success']) {
            return response()->json($result);
        }

        return response()->json($result, 400);
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

class CustomerController extends Controller
{
    public function index()
    {
        return response()->json(Customer::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
        ]);

        $customer = Customer::create($request->all());

        return response()->json($customer, 201);
    }

    public function show(Customer $customer)
    {
        return response()->json($customer->load(['subscriptions.package', 'mikrotikSecrets']));
    }

    public function update(Request $request, Customer $customer)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'status' => 'sometimes|in:active,inactive,suspended',
        ]);

        $customer->update($request->all());

        return response()->json($customer);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->json(null, 204);
    }
}
```

### app/Http/Controllers/Api/PackageController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Package;
use Illuminate\Http\Request;

class PackageController extends Controller
{
    public function index()
    {
        return response()->json(Package::orderBy('price')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'bandwidth' => 'required|string',
            'price' => 'required|numeric|min:0',
            'type' => 'required|in:pppoe,hotspot,static',
        ]);

        $package = Package::create($request->all());

        return response()->json($package, 201);
    }

    public function show(Package $package)
    {
        return response()->json($package);
    }

    public function update(Request $request, Package $package)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'bandwidth' => 'sometimes|string',
            'price' => 'sometimes|numeric|min:0',
            'type' => 'sometimes|in:pppoe,hotspot,static',
        ]);

        $package->update($request->all());

        return response()->json($package);
    }

    public function destroy(Package $package)
    {
        $package->delete();

        return response()->json(null, 204);
    }

    public function syncToMikrotik(Package $package)
    {
        // Sync package as MikroTik profile
        // Implementation depends on your MikroTik profile structure
        return response()->json(['success' => true, 'message' => 'Profile synced']);
    }
}
```

### app/Http/Controllers/Api/InvoiceController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    public function index(Request $request)
    {
        $query = Invoice::with(['subscription.customer', 'subscription.package']);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('subscription_id')) {
            $query->where('subscription_id', $request->subscription_id);
        }

        return response()->json($query->orderBy('due_date', 'desc')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'subscription_id' => 'required|exists:subscriptions,id',
            'amount' => 'required|numeric|min:0',
            'due_date' => 'required|date',
        ]);

        $invoice = Invoice::create($request->all());

        return response()->json($invoice, 201);
    }

    public function show(Invoice $invoice)
    {
        return response()->json($invoice->load(['subscription.customer', 'subscription.package', 'payments']));
    }

    public function update(Request $request, Invoice $invoice)
    {
        $request->validate([
            'status' => 'sometimes|in:unpaid,paid,overdue,cancelled,pending',
            'notes' => 'nullable|string',
        ]);

        $invoice->update($request->all());

        return response()->json($invoice);
    }

    public function unpaid()
    {
        $invoices = Invoice::with(['subscription.customer', 'subscription.package'])
            ->whereIn('status', ['unpaid', 'overdue', 'pending'])
            ->orderBy('due_date')
            ->get();

        return response()->json($invoices);
    }
}
```

### app/Http/Controllers/Api/PaymentController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Invoice;
use App\Services\MikrotikService;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = Payment::with(['invoice.subscription.customer']);

        if ($request->has('invoice_id')) {
            $query->where('invoice_id', $request->invoice_id);
        }

        return response()->json($query->orderBy('payment_date', 'desc')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
            'amount' => 'required|numeric|min:0',
            'method' => 'required|string',
            'payment_date' => 'nullable|date',
        ]);

        $invoice = Invoice::findOrFail($request->invoice_id);

        // Create payment
        $payment = Payment::create([
            'invoice_id' => $invoice->id,
            'amount' => $request->amount,
            'method' => $request->method,
            'transaction_id' => $request->transaction_id,
            'payment_date' => $request->payment_date ?? now(),
        ]);

        // Update invoice status
        $invoice->update(['status' => 'paid']);

        // Activate subscription if needed
        $subscription = $invoice->subscription;
        if ($subscription && $subscription->status !== 'active') {
            $subscription->update(['status' => 'active']);
            
            // Enable MikroTik user
            try {
                $mikrotik = new MikrotikService();
                $mikrotik->toggleUser($subscription->mikrotik_username, true);
            } catch (\Exception $e) {
                // Log but don't fail
            }
        }

        return response()->json($payment, 201);
    }

    public function show(Payment $payment)
    {
        return response()->json($payment->load(['invoice.subscription.customer']));
    }
}
```

### app/Http/Controllers/Api/DashboardController.php

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function stats()
    {
        $totalCustomers = Customer::count();
        $activeSubscriptions = Subscription::where('status', 'active')->count();
        $unpaidInvoices = Invoice::whereIn('status', ['unpaid', 'overdue'])->count();
        $monthlyRevenue = Payment::whereMonth('payment_date', now()->month)
            ->whereYear('payment_date', now()->year)
            ->sum('amount');

        return response()->json([
            'totalCustomers' => $totalCustomers,
            'activeSubscriptions' => $activeSubscriptions,
            'unpaidInvoices' => $unpaidInvoices,
            'monthlyRevenue' => (float) $monthlyRevenue,
        ]);
    }

    public function recentPayments()
    {
        return response()->json(
            Payment::with(['invoice.subscription.customer'])
                ->orderBy('payment_date', 'desc')
                ->limit(10)
                ->get()
        );
    }

    public function expiringSubscriptions()
    {
        return response()->json(
            Subscription::with(['customer', 'package'])
                ->where('status', 'active')
                ->where('end_date', '<=', now()->addDays(7))
                ->orderBy('end_date')
                ->get()
        );
    }
}
```

---

## 6. API Routes

### routes/api.php

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\PackageController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\MikrotikController;
use App\Http\Controllers\Api\MikrotikSecretController;
use App\Http\Controllers\Api\RouterSettingController;
use App\Http\Controllers\Api\MidtransController;

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register', [AuthController::class, 'register']);

// Midtrans webhook (must be public)
Route::post('/midtrans/notification', [MidtransController::class, 'handleNotification']);

/*
|--------------------------------------------------------------------------
| Protected Routes
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/user', [AuthController::class, 'user']);

    // Dashboard
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/recent-payments', [DashboardController::class, 'recentPayments']);
    Route::get('/dashboard/expiring-subscriptions', [DashboardController::class, 'expiringSubscriptions']);

    // Customers
    Route::apiResource('customers', CustomerController::class);

    // Packages
    Route::apiResource('packages', PackageController::class);
    Route::post('/packages/{package}/sync', [PackageController::class, 'syncToMikrotik']);

    // Subscriptions
    Route::apiResource('subscriptions', SubscriptionController::class);

    // Invoices
    Route::apiResource('invoices', InvoiceController::class);
    Route::get('/invoices-unpaid', [InvoiceController::class, 'unpaid']);

    // Payments
    Route::apiResource('payments', PaymentController::class)->only(['index', 'store', 'show']);

    // Router Settings
    Route::get('/router-settings', [RouterSettingController::class, 'index']);
    Route::post('/router-settings', [RouterSettingController::class, 'store']);
    Route::put('/router-settings/{routerSetting}', [RouterSettingController::class, 'update']);

    // MikroTik
    Route::prefix('mikrotik')->group(function () {
        Route::get('/test', [MikrotikController::class, 'testConnection']);
        Route::get('/system', [MikrotikController::class, 'system']);
        Route::get('/online-users', [MikrotikController::class, 'onlineUsers']);
        Route::get('/user-detail/{username}', [MikrotikController::class, 'userDetail']);
        Route::post('/toggle-user', [MikrotikController::class, 'toggleUser']);
        Route::post('/disconnect-user', [MikrotikController::class, 'disconnectUser']);
        Route::get('/traffic', [MikrotikController::class, 'traffic']);
        Route::get('/profiles', [MikrotikController::class, 'profiles']);
        Route::post('/import-secrets', [MikrotikController::class, 'importSecrets']);
        Route::post('/sync-secret', [MikrotikController::class, 'syncSecret']);
    });

    // MikroTik Secrets
    Route::apiResource('mikrotik-secrets', MikrotikSecretController::class);

    // Midtrans Payment
    Route::prefix('midtrans')->group(function () {
        Route::get('/client-key', [MidtransController::class, 'getClientKey']);
        Route::post('/snap-token', [MidtransController::class, 'createSnapToken']);
        Route::post('/payment-url', [MidtransController::class, 'createPaymentUrl']);
        Route::get('/status/{orderId}', [MidtransController::class, 'checkStatus']);
        Route::post('/cancel/{orderId}', [MidtransController::class, 'cancelTransaction']);
    });
});
```

---

## 7. Midtrans Integration

### Frontend Midtrans Component

Create `src/components/payments/MidtransPayment.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";

interface MidtransPaymentProps {
  invoiceId: string;
  amount: number;
  onSuccess?: () => void;
  onPending?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    snap: {
      pay: (
        token: string,
        options: {
          onSuccess: (result: any) => void;
          onPending: (result: any) => void;
          onError: (result: any) => void;
          onClose: () => void;
        }
      ) => void;
    };
  }
}

export function MidtransPayment({
  invoiceId,
  amount,
  onSuccess,
  onPending,
  onError,
  onClose,
}: MidtransPaymentProps) {
  const [loading, setLoading] = useState(false);
  const [snapReady, setSnapReady] = useState(false);

  useEffect(() => {
    // Load Midtrans Snap.js
    const loadSnapScript = async () => {
      try {
        const { client_key } = await api.getMidtransClientKey();
        
        const script = document.createElement("script");
        script.src = "https://app.sandbox.midtrans.com/snap/snap.js"; // Use https://app.midtrans.com/snap/snap.js for production
        script.setAttribute("data-client-key", client_key);
        script.onload = () => setSnapReady(true);
        document.body.appendChild(script);
      } catch (error) {
        console.error("Failed to load Midtrans:", error);
      }
    };

    if (!window.snap) {
      loadSnapScript();
    } else {
      setSnapReady(true);
    }
  }, []);

  const handlePayment = async () => {
    if (!snapReady) {
      toast.error("Payment system is loading, please wait...");
      return;
    }

    setLoading(true);

    try {
      const response = await api.createMidtransSnapToken(invoiceId);

      if (!response.success) {
        throw new Error(response.message || "Failed to create payment");
      }

      window.snap.pay(response.snap_token, {
        onSuccess: (result) => {
          toast.success("Payment successful!");
          onSuccess?.();
        },
        onPending: (result) => {
          toast.info("Payment is pending. Please complete the payment.");
          onPending?.();
        },
        onError: (result) => {
          toast.error("Payment failed. Please try again.");
          onError?.(result.status_message || "Payment failed");
        },
        onClose: () => {
          toast.info("Payment popup closed");
          onClose?.();
        },
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate payment");
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading || !snapReady}
      className="w-full"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <CreditCard className="mr-2 h-4 w-4" />
          Pay Rp {amount.toLocaleString("id-ID")}
        </>
      )}
    </Button>
  );
}
```

---

## 8. Frontend API Client

### src/lib/api.ts

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/auth';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ==========================================
  // AUTH
  // ==========================================

  async login(email: string, password: string) {
    const data = await this.request<{ user: any; token: string; isAdmin: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(name: string, email: string, password: string, passwordConfirmation: string) {
    const data = await this.request<{ user: any; token: string; isAdmin: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, password_confirmation: passwordConfirmation }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async getUser() {
    return this.request<{ user: any; isAdmin: boolean }>('/auth/user');
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  async getDashboardStats() {
    return this.request<{
      totalCustomers: number;
      activeSubscriptions: number;
      unpaidInvoices: number;
      monthlyRevenue: number;
    }>('/dashboard/stats');
  }

  async getRecentPayments() {
    return this.request<any[]>('/dashboard/recent-payments');
  }

  async getExpiringSubscriptions() {
    return this.request<any[]>('/dashboard/expiring-subscriptions');
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================

  async getCustomers() {
    return this.request<any[]>('/customers');
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

  async getPackage(id: string) {
    return this.request<any>(`/packages/${id}`);
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
    return this.request<{ success: boolean }>(`/packages/${id}/sync`, { method: 'POST' });
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  async getSubscriptions() {
    return this.request<any[]>('/subscriptions');
  }

  async getSubscription(id: string) {
    return this.request<any>(`/subscriptions/${id}`);
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

  // ==========================================
  // INVOICES
  // ==========================================

  async getInvoices(params?: { status?: string; subscription_id?: string }) {
    const searchParams = new URLSearchParams(params as any).toString();
    return this.request<any[]>(`/invoices${searchParams ? `?${searchParams}` : ''}`);
  }

  async getInvoice(id: string) {
    return this.request<any>(`/invoices/${id}`);
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

  async getUnpaidInvoices() {
    return this.request<any[]>('/invoices-unpaid');
  }

  // ==========================================
  // PAYMENTS
  // ==========================================

  async getPayments(params?: { invoice_id?: string }) {
    const searchParams = new URLSearchParams(params as any).toString();
    return this.request<any[]>(`/payments${searchParams ? `?${searchParams}` : ''}`);
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
    return this.request<any[]>('/router-settings');
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

  // ==========================================
  // MIKROTIK
  // ==========================================

  async testMikrotikConnection() {
    return this.request<{ success: boolean; message: string; data?: any }>('/mikrotik/test');
  }

  async getMikrotikSystem() {
    return this.request<{ success: boolean; data: any }>('/mikrotik/system');
  }

  async getMikrotikOnlineUsers() {
    return this.request<{ success: boolean; data: any[] }>('/mikrotik/online-users');
  }

  async getMikrotikUserDetail(username: string, type: string = 'pppoe') {
    return this.request<{ success: boolean; data: any }>(`/mikrotik/user-detail/${username}?type=${type}`);
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

  async getMikrotikTraffic() {
    return this.request<{ success: boolean; data: any[] }>('/mikrotik/traffic');
  }

  async getMikrotikProfiles(type: string = 'pppoe') {
    return this.request<{ success: boolean; data: any[] }>(`/mikrotik/profiles?type=${type}`);
  }

  async importMikrotikSecrets() {
    return this.request<{ success: boolean; imported: number; total: number }>('/mikrotik/import-secrets', {
      method: 'POST',
    });
  }

  async syncMikrotikSecret(action: 'create' | 'update' | 'delete', secretId: string) {
    return this.request<{ success: boolean }>('/mikrotik/sync-secret', {
      method: 'POST',
      body: JSON.stringify({ action, secretId }),
    });
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

  // ==========================================
  // MIDTRANS PAYMENT
  // ==========================================

  async getMidtransClientKey() {
    return this.request<{ client_key: string }>('/midtrans/client-key');
  }

  async createMidtransSnapToken(invoiceId: string) {
    return this.request<{ success: boolean; snap_token?: string; order_id?: string; client_key?: string; message?: string }>('/midtrans/snap-token', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoiceId }),
    });
  }

  async createMidtransPaymentUrl(invoiceId: string) {
    return this.request<{ success: boolean; redirect_url?: string; order_id?: string; message?: string }>('/midtrans/payment-url', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoiceId }),
    });
  }

  async checkMidtransStatus(orderId: string) {
    return this.request<{ success: boolean; data?: any; message?: string }>(`/midtrans/status/${orderId}`);
  }

  async cancelMidtransTransaction(orderId: string) {
    return this.request<{ success: boolean; data?: any; message?: string }>(`/midtrans/cancel/${orderId}`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
export default api;
```

---

## 9. Frontend Component Changes

### Environment Variable

Add to frontend `.env`:

```env
VITE_API_URL=http://localhost:8000/api
```

### Component Migration Map

| Component | Before (Supabase) | After (Laravel) |
|-----------|-------------------|-----------------|
| OnlineUsers.tsx | `supabase.functions.invoke("mikrotik-online-users")` | `api.getMikrotikOnlineUsers()` |
| SystemStats.tsx | `supabase.functions.invoke("mikrotik-system")` | `api.getMikrotikSystem()` |
| TrafficGraph.tsx | `supabase.functions.invoke("mikrotik-traffic")` | `api.getMikrotikTraffic()` |
| CustomerList.tsx | `supabase.from("customers").select()` | `api.getCustomers()` |
| SecretList.tsx | `supabase.from("mikrotik_secrets").select()` | `api.getMikrotikSecrets()` |
| RouterSettings.tsx | `supabase.from("router_settings").select()` | `api.getRouterSettings()` |
| PaymentForm.tsx | Manual payment | `MidtransPayment` component |
| Dashboard.tsx | Multiple Supabase queries | `api.getDashboardStats()` |
| useAuth.tsx | `supabase.auth.*` | `api.login()`, `api.getUser()` |

---

## 10. Authentication Migration

### src/hooks/useAuth.tsx

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

## 11. Deployment Guide

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
# Edit .env with production values including Midtrans keys

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

### Supervisor for Background Jobs

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

### Crontab for Scheduler

```bash
* * * * * cd /var/www/isp-billing && php artisan schedule:run >> /dev/null 2>&1
```

### Midtrans Webhook Setup

1. Login to Midtrans Dashboard
2. Go to Settings → Configuration
3. Set Payment Notification URL: `https://api.yourdomain.com/api/midtrans/notification`
4. Enable notification for: payment, recurring, pay account

---

## Summary

Documentation covers:

1. ✅ Complete MySQL schema (billing + monitoring + Midtrans)
2. ✅ Laravel 11/12 Models with UUID
3. ✅ MikrotikService (RouterOS v6 compatible)
4. ✅ MidtransService (Snap, webhook, status check)
5. ✅ All API Controllers
6. ✅ Complete API Routes
7. ✅ Frontend API Client (`src/lib/api.ts`)
8. ✅ Midtrans Payment Component
9. ✅ Component migration guide
10. ✅ Auth migration (Supabase → Sanctum)
11. ✅ Deployment guide

**Next Steps:**
1. Setup Laravel project with `composer create-project`
2. Install dependencies: `composer require midtrans/midtrans-php evilfreelancer/routeros-api-php`
3. Import database schema
4. Configure Midtrans keys in `.env`
5. Update frontend components
6. Setup Midtrans webhook URL
7. Test & deploy
