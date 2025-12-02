# Complete Laravel Backend Plan - XAMPP Local Development

## Overview
Backend Laravel 11 untuk ISP Billing System dengan integrasi MikroTik RouterOS dan Midtrans Payment Gateway.
Dikembangkan di XAMPP lokal, kemudian di-host ke production server.

---

## 1. XAMPP Requirements

### Minimum Requirements
- XAMPP 8.2+ (PHP 8.2+)
- MySQL 8.0+
- Composer 2.x
- Node.js 18+ (untuk frontend)

### PHP Extensions (pastikan enabled di php.ini)
```ini
extension=curl
extension=fileinfo
extension=gd
extension=mbstring
extension=openssl
extension=pdo_mysql
extension=sodium
extension=zip
```

### XAMPP Configuration
```
# Lokasi instalasi default
C:\\xampp\\htdocs\\isp-billing-api\\

# Virtual Host (opsional, recommended)
# Edit: C:\\xampp\\apache\\conf\\extra\\httpd-vhosts.conf
<VirtualHost *:80>
    DocumentRoot "C:/xampp/htdocs/isp-billing-api/public"
    ServerName api.ispbilling.local
    <Directory "C:/xampp/htdocs/isp-billing-api/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

# Edit: C:\\Windows\\System32\\drivers\\etc\\hosts
127.0.0.1 api.ispbilling.local
```

---

## 2. Project Setup

### Create Laravel Project
```bash
cd C:\\xampp\\htdocs
composer create-project laravel/laravel isp-billing-api
cd isp-billing-api
```

### Install Dependencies
```bash
# Authentication
composer require laravel/sanctum

# MikroTik RouterOS API
composer require evilfreelancer/routeros-api-php

# Midtrans Payment Gateway
composer require midtrans/midtrans-php

# SNMP (untuk monitoring)
# Note: PHP SNMP extension harus di-enable di php.ini
```

### Environment Configuration (.env)
```env
APP_NAME="ISP Billing API"
APP_ENV=local
APP_KEY=base64:generate-with-php-artisan-key-generate
APP_DEBUG=true
APP_URL=http://localhost/isp-billing-api/public
# atau jika pakai virtual host:
# APP_URL=http://api.ispbilling.local

# Database - XAMPP MySQL
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=root
DB_PASSWORD=

# Frontend URL (untuk CORS)
FRONTEND_URL=http://localhost:5173

# MikroTik Settings (akan diambil dari DB, ini fallback)
MIKROTIK_HOST=192.168.88.1
MIKROTIK_PORT=8728
MIKROTIK_USERNAME=admin
MIKROTIK_PASSWORD=
MIKROTIK_SSL=false

# Midtrans Configuration
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_MERCHANT_ID=G123456789

# Notification Settings
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@ispbilling.com
MAIL_FROM_NAME="ISP Billing"
```

### CORS Configuration (config/cors.php)
```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://localhost:3000',
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

## 3. Database Schema

### Create Database di phpMyAdmin
```sql
CREATE DATABASE isp_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Migration Files

#### 2024_01_01_000001_create_users_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->enum('role', ['admin', 'operator', 'viewer'])->default('operator');
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
```

#### 2024_01_01_000002_create_customers_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->enum('status', ['active', 'inactive', 'suspended'])->default('active');
            $table->timestamps();
            
            $table->index('status');
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
```

#### 2024_01_01_000003_create_packages_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->enum('type', ['pppoe', 'hotspot', 'static'])->default('pppoe');
            $table->string('bandwidth'); // e.g., "10M/10M"
            $table->string('burst')->nullable(); // e.g., "15M/15M 10M/10M 10/10 5s/5s"
            $table->decimal('price', 12, 2);
            $table->integer('priority')->nullable()->default(8);
            $table->integer('validity_days')->default(30);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            $table->index('type');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packages');
    }
};
```

#### 2024_01_01_000004_create_subscriptions_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('customer_id');
            $table->uuid('package_id');
            $table->string('mikrotik_username')->unique();
            $table->string('mikrotik_password');
            $table->date('start_date');
            $table->date('end_date');
            $table->enum('status', ['active', 'suspended', 'expired', 'cancelled'])->default('active');
            $table->boolean('auto_renew')->default(true);
            $table->string('local_address')->nullable();
            $table->string('remote_address')->nullable();
            $table->string('profile')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();
            
            $table->foreign('customer_id')->references('id')->on('customers')->onDelete('cascade');
            $table->foreign('package_id')->references('id')->on('packages')->onDelete('restrict');
            
            $table->index('status');
            $table->index('end_date');
            $table->index(['customer_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
    }
};
```

#### 2024_01_01_000005_create_invoices_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('invoice_number')->unique();
            $table->uuid('subscription_id');
            $table->decimal('amount', 12, 2);
            $table->date('due_date');
            $table->enum('status', ['unpaid', 'paid', 'overdue', 'cancelled'])->default('unpaid');
            $table->string('payment_reference')->nullable();
            $table->string('payment_url')->nullable();
            $table->string('midtrans_order_id')->nullable();
            $table->string('midtrans_transaction_id')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            
            $table->foreign('subscription_id')->references('id')->on('subscriptions')->onDelete('cascade');
            
            $table->index('status');
            $table->index('due_date');
            $table->index('midtrans_order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
```

#### 2024_01_01_000006_create_payments_table.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id');
            $table->decimal('amount', 12, 2);
            $table->enum('method', ['cash', 'transfer', 'midtrans', 'qris', 'gopay', 'ovo', 'dana'])->default('cash');
            $table->string('transaction_id')->nullable();
            $table->string('midtrans_transaction_id')->nullable();
            $table->enum('midtrans_status', ['pending', 'settlement', 'capture', 'deny', 'cancel', 'expire', 'refund'])->nullable();
            $table->json('midtrans_response')->nullable();
            $table->timestamp('payment_date')->useCurrent();
            $table->text('notes')->nullable();
            $table->timestamps();
            
            $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('cascade');
            
            $table->index('method');
            $table->index('payment_date');
            $table->index('midtrans_transaction_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
```

#### 2024_01_01_000007_create_mikrotik_tables.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Router Settings
        Schema::create('router_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name')->default('Main Router');
            $table->string('host');
            $table->integer('port')->default(8728);
            $table->string('username');
            $table->string('password');
            $table->boolean('ssl')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_connected_at')->nullable();
            $table->timestamps();
        });

        // MikroTik Secrets (PPPoE/Hotspot Users synced from MikroTik)
        Schema::create('mikrotik_secrets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('customer_id')->nullable();
            $table->string('username');
            $table->string('password');
            $table->enum('service', ['pppoe', 'hotspot', 'any'])->default('pppoe');
            $table->string('profile')->nullable();
            $table->string('local_address')->nullable();
            $table->string('remote_address')->nullable();
            $table->string('comment')->nullable();
            $table->boolean('disabled')->default(false);
            $table->string('mikrotik_id')->nullable(); // .id from MikroTik
            $table->timestamps();
            
            $table->foreign('customer_id')->references('id')->on('customers')->onDelete('set null');
            
            $table->unique('username');
            $table->index('service');
            $table->index('disabled');
        });

        // RADIUS Settings
        Schema::create('radius_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('host');
            $table->integer('port')->default(1812);
            $table->string('secret');
            $table->string('nas_identifier')->default('mikrotik');
            $table->boolean('enabled')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radius_settings');
        Schema::dropIfExists('mikrotik_secrets');
        Schema::dropIfExists('router_settings');
    }
};
```

#### 2024_01_01_000008_create_snmp_monitoring_tables.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SNMP Devices
        Schema::create('snmp_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('host');
            $table->integer('port')->default(161);
            $table->enum('version', ['1', '2c', '3'])->default('2c');
            $table->string('community')->default('public');
            // SNMPv3 fields
            $table->string('security_name')->nullable();
            $table->enum('security_level', ['noAuthNoPriv', 'authNoPriv', 'authPriv'])->nullable();
            $table->string('auth_protocol')->nullable();
            $table->string('auth_password')->nullable();
            $table->string('priv_protocol')->nullable();
            $table->string('priv_password')->nullable();
            $table->enum('device_type', ['router', 'switch', 'olt', 'server', 'other'])->default('router');
            $table->string('location')->nullable();
            $table->boolean('is_active')->default(true);
            $table->enum('status', ['up', 'down', 'unknown'])->default('unknown');
            $table->timestamp('last_polled_at')->nullable();
            $table->timestamps();
            
            $table->index('is_active');
            $table->index('status');
        });

        // SNMP Interfaces
        Schema::create('snmp_interfaces', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('device_id');
            $table->integer('if_index');
            $table->string('if_name');
            $table->string('if_descr')->nullable();
            $table->bigInteger('if_speed')->nullable();
            $table->enum('if_oper_status', ['up', 'down', 'testing', 'unknown'])->default('unknown');
            $table->enum('if_admin_status', ['up', 'down', 'testing'])->default('up');
            $table->boolean('monitor_bandwidth')->default(false);
            $table->timestamps();
            
            $table->foreign('device_id')->references('id')->on('snmp_devices')->onDelete('cascade');
            
            $table->unique(['device_id', 'if_index']);
            $table->index('monitor_bandwidth');
        });

        // Bandwidth History
        Schema::create('bandwidth_history', function (Blueprint $table) {
            $table->id();
            $table->uuid('interface_id');
            $table->bigInteger('in_octets');
            $table->bigInteger('out_octets');
            $table->bigInteger('in_rate')->nullable(); // bps
            $table->bigInteger('out_rate')->nullable(); // bps
            $table->timestamp('recorded_at');
            
            $table->foreign('interface_id')->references('id')->on('snmp_interfaces')->onDelete('cascade');
            
            $table->index('recorded_at');
            $table->index(['interface_id', 'recorded_at']);
        });

        // Ping Targets
        Schema::create('ping_targets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('host');
            $table->string('group')->nullable();
            $table->integer('interval_seconds')->default(60);
            $table->integer('timeout_ms')->default(1000);
            $table->integer('packet_count')->default(4);
            $table->boolean('is_active')->default(true);
            $table->enum('status', ['up', 'down', 'unknown'])->default('unknown');
            $table->float('last_latency_ms')->nullable();
            $table->float('packet_loss_percent')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
            
            $table->index('is_active');
            $table->index('status');
            $table->index('group');
        });

        // Ping History
        Schema::create('ping_history', function (Blueprint $table) {
            $table->id();
            $table->uuid('target_id');
            $table->float('latency_ms')->nullable();
            $table->float('packet_loss_percent');
            $table->enum('status', ['up', 'down']);
            $table->timestamp('recorded_at');
            
            $table->foreign('target_id')->references('id')->on('ping_targets')->onDelete('cascade');
            
            $table->index('recorded_at');
            $table->index(['target_id', 'recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_history');
        Schema::dropIfExists('ping_targets');
        Schema::dropIfExists('bandwidth_history');
        Schema::dropIfExists('snmp_interfaces');
        Schema::dropIfExists('snmp_devices');
    }
};
```

#### 2024_01_01_000009_create_notifications_and_logs_tables.php
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Notification Settings
        Schema::create('notification_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('channel', ['telegram', 'email', 'webhook']);
            $table->json('config'); // {bot_token, chat_id} or {email} or {url}
            $table->json('events'); // ['device_down', 'high_latency', 'payment_received']
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Alert Logs
        Schema::create('alert_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('type', ['device_down', 'device_up', 'high_latency', 'packet_loss', 'payment', 'subscription', 'system']);
            $table->enum('severity', ['info', 'warning', 'critical']);
            $table->string('title');
            $table->text('message');
            $table->json('meta')->nullable();
            $table->boolean('is_read')->default(false);
            $table->boolean('notification_sent')->default(false);
            $table->timestamps();
            
            $table->index('type');
            $table->index('severity');
            $table->index('is_read');
            $table->index('created_at');
        });

        // Billing Logs
        Schema::create('billing_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('subscription_id')->nullable();
            $table->uuid('invoice_id')->nullable();
            $table->string('action'); // created, renewed, suspended, cancelled, paid
            $table->text('message');
            $table->json('meta')->nullable();
            $table->timestamps();
            
            $table->foreign('subscription_id')->references('id')->on('subscriptions')->onDelete('set null');
            $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('set null');
            
            $table->index('action');
            $table->index('created_at');
        });

        // Midtrans Logs
        Schema::create('midtrans_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id')->nullable();
            $table->string('order_id');
            $table->string('transaction_id')->nullable();
            $table->enum('event', ['create', 'notification', 'status_check', 'cancel', 'refund']);
            $table->string('status')->nullable();
            $table->json('request')->nullable();
            $table->json('response')->nullable();
            $table->timestamps();
            
            $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('set null');
            
            $table->index('order_id');
            $table->index('event');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('midtrans_logs');
        Schema::dropIfExists('billing_logs');
        Schema::dropIfExists('alert_logs');
        Schema::dropIfExists('notification_settings');
    }
};
```

### Run Migrations
```bash
php artisan migrate
```

### Database Seeder (database/seeders/DatabaseSeeder.php)
```php
<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Package;
use App\Models\RouterSetting;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create Admin User
        User::create([
            'id' => Str::uuid(),
            'name' => 'Administrator',
            'email' => 'admin@ispbilling.com',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        // Create Default Packages
        $packages = [
            ['name' => '10 Mbps', 'type' => 'pppoe', 'bandwidth' => '10M/10M', 'price' => 150000],
            ['name' => '20 Mbps', 'type' => 'pppoe', 'bandwidth' => '20M/20M', 'price' => 250000],
            ['name' => '50 Mbps', 'type' => 'pppoe', 'bandwidth' => '50M/50M', 'price' => 400000],
            ['name' => '100 Mbps', 'type' => 'pppoe', 'bandwidth' => '100M/100M', 'price' => 600000],
        ];

        foreach ($packages as $pkg) {
            Package::create(array_merge($pkg, ['id' => Str::uuid()]));
        }

        // Create Default Router Setting
        RouterSetting::create([
            'id' => Str::uuid(),
            'name' => 'Main Router',
            'host' => '192.168.88.1',
            'port' => 8728,
            'username' => 'admin',
            'password' => '',
            'ssl' => false,
            'is_active' => true,
        ]);
    }
}
```

---

## 4. Laravel Models

### Trait: HasUuid (app/Traits/HasUuid.php)
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
                $model->{$model->getKeyName()} = Str::uuid()->toString();
            }
        });
    }

    public function getIncrementing(): bool
    {
        return false;
    }

    public function getKeyType(): string
    {
        return 'string';
    }
}
```

### Model: User (app/Models/User.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasUuid, Notifiable;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'name', 'email', 'password', 'role', 'is_active',
    ];

    protected $hidden = [
        'password', 'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
```

### Model: Customer (app/Models/Customer.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'name', 'email', 'phone', 'address', 'status',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function secrets(): HasMany
    {
        return $this->hasMany(MikrotikSecret::class);
    }
}
```

### Model: Package (app/Models/Package.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'name', 'type', 'bandwidth', 'burst', 'price', 
        'priority', 'validity_days', 'description', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
```

### Model: Subscription (app/Models/Subscription.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'customer_id', 'package_id', 'mikrotik_username', 'mikrotik_password',
        'start_date', 'end_date', 'status', 'auto_renew',
        'local_address', 'remote_address', 'profile', 'comment',
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

### Model: Invoice (app/Models/Invoice.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'invoice_number', 'subscription_id', 'amount', 'due_date', 'status',
        'payment_reference', 'payment_url', 'midtrans_order_id', 'midtrans_transaction_id', 'notes',
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

    public static function generateInvoiceNumber(): string
    {
        $prefix = 'INV';
        $date = now()->format('Ymd');
        $lastInvoice = self::whereDate('created_at', today())
            ->orderBy('created_at', 'desc')
            ->first();
        
        $sequence = $lastInvoice 
            ? (int) substr($lastInvoice->invoice_number, -4) + 1 
            : 1;
        
        return sprintf('%s-%s-%04d', $prefix, $date, $sequence);
    }
}
```

### Model: Payment (app/Models/Payment.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'invoice_id', 'amount', 'method', 'transaction_id',
        'midtrans_transaction_id', 'midtrans_status', 'midtrans_response',
        'payment_date', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'midtrans_response' => 'array',
            'payment_date' => 'datetime',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
```

### Model: RouterSetting (app/Models/RouterSetting.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class RouterSetting extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'name', 'host', 'port', 'username', 'password', 
        'ssl', 'is_active', 'last_connected_at',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'ssl' => 'boolean',
            'is_active' => 'boolean',
            'last_connected_at' => 'datetime',
        ];
    }
}
```

### Model: MikrotikSecret (app/Models/MikrotikSecret.php)
```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MikrotikSecret extends Model
{
    use HasUuid;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'customer_id', 'username', 'password', 'service',
        'profile', 'local_address', 'remote_address', 'comment',
        'disabled', 'mikrotik_id',
    ];

    protected $hidden = ['password'];

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

### Additional Models (create similar pattern for):
- SnmpDevice
- SnmpInterface
- BandwidthHistory
- PingTarget
- PingHistory
- NotificationSetting
- AlertLog
- BillingLog
- MidtransLog

---

## 5. Services

### MikrotikService (app/Services/MikrotikService.php)
```php
<?php

namespace App\Services;

use App\Models\RouterSetting;
use RouterOS\Client;
use RouterOS\Query;
use Illuminate\Support\Facades\Log;

class MikrotikService
{
    private ?Client $client = null;
    private ?RouterSetting $router = null;

    public function __construct(?RouterSetting $router = null)
    {
        $this->router = $router ?? RouterSetting::where('is_active', true)->first();
    }

    public function connect(): bool
    {
        if (!$this->router) {
            throw new \Exception('No router configuration found');
        }

        try {
            $this->client = new Client([
                'host' => $this->router->host,
                'port' => $this->router->port,
                'user' => $this->router->username,
                'pass' => $this->router->password,
                'ssl' => $this->router->ssl,
                'timeout' => 10,
            ]);

            $this->router->update(['last_connected_at' => now()]);
            return true;
        } catch (\Exception $e) {
            Log::error('MikroTik connection failed: ' . $e->getMessage());
            throw $e;
        }
    }

    public function testConnection(): array
    {
        try {
            $this->connect();
            $identity = $this->getIdentity();
            return [
                'success' => true,
                'identity' => $identity,
                'message' => 'Connection successful',
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    public function getIdentity(): string
    {
        $this->ensureConnected();
        $query = new Query('/system/identity/print');
        $response = $this->client->query($query)->read();
        return $response[0]['name'] ?? 'Unknown';
    }

    public function getSystemResource(): array
    {
        $this->ensureConnected();
        $query = new Query('/system/resource/print');
        $response = $this->client->query($query)->read();
        
        if (empty($response)) {
            return [];
        }

        $resource = $response[0];
        return [
            'uptime' => $resource['uptime'] ?? null,
            'version' => $resource['version'] ?? null,
            'cpu_load' => (int) ($resource['cpu-load'] ?? 0),
            'free_memory' => (int) ($resource['free-memory'] ?? 0),
            'total_memory' => (int) ($resource['total-memory'] ?? 0),
            'free_hdd' => (int) ($resource['free-hdd-space'] ?? 0),
            'total_hdd' => (int) ($resource['total-hdd-space'] ?? 0),
            'architecture' => $resource['architecture-name'] ?? null,
            'board_name' => $resource['board-name'] ?? null,
        ];
    }

    // PPPoE Secret Management
    public function getPPPoESecrets(): array
    {
        $this->ensureConnected();
        $query = new Query('/ppp/secret/print');
        return $this->client->query($query)->read();
    }

    public function createPPPoESecret(array $data): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/ppp/secret/add'))
            ->equal('name', $data['username'])
            ->equal('password', $data['password'])
            ->equal('service', $data['service'] ?? 'pppoe')
            ->equal('profile', $data['profile'] ?? 'default');

        if (!empty($data['local_address'])) {
            $query->equal('local-address', $data['local_address']);
        }
        if (!empty($data['remote_address'])) {
            $query->equal('remote-address', $data['remote_address']);
        }
        if (!empty($data['comment'])) {
            $query->equal('comment', $data['comment']);
        }

        $response = $this->client->query($query)->read();
        return ['success' => true, 'id' => $response['ret'] ?? null];
    }

    public function updatePPPoESecret(string $mikrotikId, array $data): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $mikrotikId);

        foreach ($data as $key => $value) {
            $apiKey = str_replace('_', '-', $key);
            $query->equal($apiKey, $value);
        }

        $this->client->query($query)->read();
        return ['success' => true];
    }

    public function deletePPPoESecret(string $mikrotikId): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/ppp/secret/remove'))
            ->equal('.id', $mikrotikId);

        $this->client->query($query)->read();
        return ['success' => true];
    }

    public function enablePPPoESecret(string $mikrotikId): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $mikrotikId)
            ->equal('disabled', 'no');

        $this->client->query($query)->read();
        return ['success' => true];
    }

    public function disablePPPoESecret(string $mikrotikId): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $mikrotikId)
            ->equal('disabled', 'yes');

        $this->client->query($query)->read();
        return ['success' => true];
    }

    // Active Connections
    public function getActiveConnections(): array
    {
        $this->ensureConnected();
        $query = new Query('/ppp/active/print');
        return $this->client->query($query)->read();
    }

    public function disconnectUser(string $name): array
    {
        $this->ensureConnected();
        
        // Find active session
        $query = (new Query('/ppp/active/print'))
            ->where('name', $name);
        $active = $this->client->query($query)->read();

        if (empty($active)) {
            return ['success' => false, 'message' => 'User not connected'];
        }

        // Remove active session
        $removeQuery = (new Query('/ppp/active/remove'))
            ->equal('.id', $active[0]['.id']);
        $this->client->query($removeQuery)->read();

        return ['success' => true];
    }

    // Interface Traffic
    public function getInterfaceTraffic(string $interface): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/interface/print'))
            ->where('name', $interface);
        $response = $this->client->query($query)->read();

        if (empty($response)) {
            return [];
        }

        return [
            'name' => $response[0]['name'],
            'rx_byte' => (int) ($response[0]['rx-byte'] ?? 0),
            'tx_byte' => (int) ($response[0]['tx-byte'] ?? 0),
            'rx_packet' => (int) ($response[0]['rx-packet'] ?? 0),
            'tx_packet' => (int) ($response[0]['tx-packet'] ?? 0),
        ];
    }

    public function getInterfaces(): array
    {
        $this->ensureConnected();
        $query = new Query('/interface/print');
        return $this->client->query($query)->read();
    }

    // Queue Management
    public function createSimpleQueue(array $data): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/queue/simple/add'))
            ->equal('name', $data['name'])
            ->equal('target', $data['target'])
            ->equal('max-limit', $data['max_limit']);

        if (!empty($data['burst_limit'])) {
            $query->equal('burst-limit', $data['burst_limit']);
        }
        if (!empty($data['burst_threshold'])) {
            $query->equal('burst-threshold', $data['burst_threshold']);
        }
        if (!empty($data['burst_time'])) {
            $query->equal('burst-time', $data['burst_time']);
        }
        if (!empty($data['priority'])) {
            $query->equal('priority', $data['priority']);
        }
        if (!empty($data['comment'])) {
            $query->equal('comment', $data['comment']);
        }

        $response = $this->client->query($query)->read();
        return ['success' => true, 'id' => $response['ret'] ?? null];
    }

    public function deleteSimpleQueue(string $mikrotikId): array
    {
        $this->ensureConnected();
        
        $query = (new Query('/queue/simple/remove'))
            ->equal('.id', $mikrotikId);

        $this->client->query($query)->read();
        return ['success' => true];
    }

    // Profiles
    public function getProfiles(): array
    {
        $this->ensureConnected();
        $query = new Query('/ppp/profile/print');
        return $this->client->query($query)->read();
    }

    // Hotspot Users
    public function getHotspotUsers(): array
    {
        $this->ensureConnected();
        $query = new Query('/ip/hotspot/user/print');
        return $this->client->query($query)->read();
    }

    public function getHotspotActive(): array
    {
        $this->ensureConnected();
        $query = new Query('/ip/hotspot/active/print');
        return $this->client->query($query)->read();
    }

    // DHCP Leases
    public function getDHCPLeases(): array
    {
        $this->ensureConnected();
        $query = new Query('/ip/dhcp-server/lease/print');
        return $this->client->query($query)->read();
    }

    private function ensureConnected(): void
    {
        if (!$this->client) {
            $this->connect();
        }
    }
}
```

### MidtransService (app/Services/MidtransService.php)
```php
<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\MidtransLog;
use Midtrans\Config;
use Midtrans\Snap;
use Midtrans\Transaction;
use Midtrans\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MidtransService
{
    public function __construct()
    {
        Config::$serverKey = config('services.midtrans.server_key');
        Config::$clientKey = config('services.midtrans.client_key');
        Config::$isProduction = config('services.midtrans.is_production', false);
        Config::$isSanitized = true;
        Config::$is3ds = true;
    }

    public function createSnapToken(Invoice $invoice): array
    {
        $subscription = $invoice->subscription;
        $customer = $subscription->customer;
        $package = $subscription->package;

        $orderId = 'INV-' . $invoice->id . '-' . time();
        
        $params = [
            'transaction_details' => [
                'order_id' => $orderId,
                'gross_amount' => (int) $invoice->amount,
            ],
            'customer_details' => [
                'first_name' => $customer->name,
                'email' => $customer->email ?? 'customer@example.com',
                'phone' => $customer->phone ?? '',
            ],
            'item_details' => [
                [
                    'id' => $package->id,
                    'price' => (int) $invoice->amount,
                    'quantity' => 1,
                    'name' => 'Internet ' . $package->name . ' - ' . $invoice->invoice_number,
                ],
            ],
            'callbacks' => [
                'finish' => config('app.frontend_url') . '/payments/finish',
                'error' => config('app.frontend_url') . '/payments/error',
                'pending' => config('app.frontend_url') . '/payments/pending',
            ],
        ];

        try {
            $snapToken = Snap::getSnapToken($params);
            
            // Update invoice with Midtrans order ID
            $invoice->update([
                'midtrans_order_id' => $orderId,
                'payment_url' => 'https://app.midtrans.com/snap/v2/vtweb/' . $snapToken,
            ]);

            // Log the transaction
            MidtransLog::create([
                'id' => Str::uuid(),
                'invoice_id' => $invoice->id,
                'order_id' => $orderId,
                'event' => 'create',
                'request' => $params,
                'response' => ['snap_token' => $snapToken],
            ]);

            return [
                'success' => true,
                'snap_token' => $snapToken,
                'order_id' => $orderId,
                'redirect_url' => 'https://app.sandbox.midtrans.com/snap/v2/vtweb/' . $snapToken,
            ];
        } catch (\Exception $e) {
            Log::error('Midtrans createSnapToken error: ' . $e->getMessage());
            
            MidtransLog::create([
                'id' => Str::uuid(),
                'invoice_id' => $invoice->id,
                'order_id' => $orderId,
                'event' => 'create',
                'request' => $params,
                'response' => ['error' => $e->getMessage()],
            ]);

            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    public function handleNotification(array $data): array
    {
        try {
            $notification = new Notification();
            
            $orderId = $notification->order_id;
            $transactionId = $notification->transaction_id;
            $transactionStatus = $notification->transaction_status;
            $fraudStatus = $notification->fraud_status ?? null;
            $paymentType = $notification->payment_type;

            // Find invoice by order_id
            $invoice = Invoice::where('midtrans_order_id', $orderId)->first();
            
            if (!$invoice) {
                Log::warning('Invoice not found for order_id: ' . $orderId);
                return ['success' => false, 'message' => 'Invoice not found'];
            }

            // Log notification
            MidtransLog::create([
                'id' => Str::uuid(),
                'invoice_id' => $invoice->id,
                'order_id' => $orderId,
                'transaction_id' => $transactionId,
                'event' => 'notification',
                'status' => $transactionStatus,
                'response' => $data,
            ]);

            // Process based on status
            if ($transactionStatus == 'capture') {
                if ($fraudStatus == 'accept') {
                    $this->processPaymentSuccess($invoice, $transactionId, $paymentType, $data);
                }
            } elseif ($transactionStatus == 'settlement') {
                $this->processPaymentSuccess($invoice, $transactionId, $paymentType, $data);
            } elseif (in_array($transactionStatus, ['cancel', 'deny', 'expire'])) {
                $this->processPaymentFailed($invoice, $transactionStatus);
            } elseif ($transactionStatus == 'pending') {
                $invoice->update(['status' => 'unpaid']);
            }

            return ['success' => true, 'status' => $transactionStatus];
        } catch (\Exception $e) {
            Log::error('Midtrans notification error: ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function processPaymentSuccess(Invoice $invoice, string $transactionId, string $paymentType, array $data): void
    {
        // Create payment record
        Payment::create([
            'id' => Str::uuid(),
            'invoice_id' => $invoice->id,
            'amount' => $invoice->amount,
            'method' => $this->mapPaymentType($paymentType),
            'midtrans_transaction_id' => $transactionId,
            'midtrans_status' => 'settlement',
            'midtrans_response' => $data,
            'payment_date' => now(),
        ]);

        // Update invoice
        $invoice->update([
            'status' => 'paid',
            'midtrans_transaction_id' => $transactionId,
            'payment_reference' => $transactionId,
        ]);

        // Enable subscription & MikroTik user if suspended
        $subscription = $invoice->subscription;
        if ($subscription->status === 'suspended') {
            $subscription->update(['status' => 'active']);
            
            // Re-enable MikroTik user
            try {
                $mikrotik = new MikrotikService();
                // Enable the PPPoE secret by username
                $secrets = $mikrotik->getPPPoESecrets();
                foreach ($secrets as $secret) {
                    if ($secret['name'] === $subscription->mikrotik_username) {
                        $mikrotik->enablePPPoESecret($secret['.id']);
                        break;
                    }
                }
            } catch (\Exception $e) {
                Log::error('Failed to enable MikroTik user: ' . $e->getMessage());
            }
        }
    }

    private function processPaymentFailed(Invoice $invoice, string $status): void
    {
        $invoice->update(['status' => 'unpaid']);
    }

    private function mapPaymentType(string $type): string
    {
        $map = [
            'credit_card' => 'midtrans',
            'gopay' => 'gopay',
            'shopeepay' => 'midtrans',
            'qris' => 'qris',
            'bank_transfer' => 'transfer',
            'echannel' => 'transfer',
            'bca_klikpay' => 'transfer',
            'cimb_clicks' => 'transfer',
            'danamon_online' => 'transfer',
        ];

        return $map[$type] ?? 'midtrans';
    }

    public function checkStatus(string $orderId): array
    {
        try {
            $status = Transaction::status($orderId);
            return ['success' => true, 'data' => $status];
        } catch (\Exception $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function cancelTransaction(string $orderId): array
    {
        try {
            $cancel = Transaction::cancel($orderId);
            return ['success' => true, 'data' => $cancel];
        } catch (\Exception $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }
}
```

### NotificationService (app/Services/NotificationService.php)
```php
<?php

namespace App\Services;

use App\Models\NotificationSetting;
use App\Models\AlertLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class NotificationService
{
    public function sendAlert(string $type, string $severity, string $title, string $message, array $meta = []): void
    {
        // Create alert log
        $alert = AlertLog::create([
            'id' => Str::uuid(),
            'type' => $type,
            'severity' => $severity,
            'title' => $title,
            'message' => $message,
            'meta' => $meta,
        ]);

        // Get active notification settings
        $settings = NotificationSetting::where('is_active', true)->get();

        foreach ($settings as $setting) {
            $events = $setting->events ?? [];
            
            // Check if this event type should trigger notification
            if (!in_array($type, $events) && !in_array('all', $events)) {
                continue;
            }

            try {
                match ($setting->channel) {
                    'telegram' => $this->sendTelegram($setting->config, $title, $message, $severity),
                    'email' => $this->sendEmail($setting->config, $title, $message),
                    'webhook' => $this->sendWebhook($setting->config, $alert),
                    default => null,
                };

                $alert->update(['notification_sent' => true]);
            } catch (\Exception $e) {
                \Log::error("Failed to send {$setting->channel} notification: " . $e->getMessage());
            }
        }
    }

    private function sendTelegram(array $config, string $title, string $message, string $severity): void
    {
        $botToken = $config['bot_token'] ?? null;
        $chatId = $config['chat_id'] ?? null;

        if (!$botToken || !$chatId) {
            return;
        }

        $emoji = match ($severity) {
            'critical' => '🔴',
            'warning' => '🟡',
            default => '🔵',
        };

        $text = "{$emoji} *{$title}*\n\n{$message}";

        Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'Markdown',
        ]);
    }

    private function sendEmail(array $config, string $title, string $message): void
    {
        $email = $config['email'] ?? null;
        
        if (!$email) {
            return;
        }

        Mail::raw($message, function ($mail) use ($email, $title) {
            $mail->to($email)->subject("[ISP Billing] {$title}");
        });
    }

    private function sendWebhook(array $config, AlertLog $alert): void
    {
        $url = $config['url'] ?? null;
        
        if (!$url) {
            return;
        }

        Http::post($url, $alert->toArray());
    }
}
```

---

## 6. API Controllers

### AuthController (app/Http/Controllers/Api/AuthController.php)
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

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Your account has been deactivated.'],
            ]);
        }

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}
```

### CustomerController (app/Http/Controllers/Api/CustomerController.php)
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $query = Customer::query();

        if ($request->has('status')) {
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

        $customers = $query->orderBy('created_at', 'desc')->paginate(20);
        return response()->json($customers);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,suspended',
        ]);

        $customer = Customer::create($validated);
        return response()->json($customer, 201);
    }

    public function show(Customer $customer)
    {
        return response()->json($customer->load(['subscriptions.package', 'secrets']));
    }

    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,suspended',
        ]);

        $customer->update($validated);
        return response()->json($customer);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();
        return response()->json(null, 204);
    }
}
```

### MikrotikController (app/Http/Controllers/Api/MikrotikController.php)
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MikrotikService;
use Illuminate\Http\Request;

class MikrotikController extends Controller
{
    public function testConnection()
    {
        $mikrotik = new MikrotikService();
        $result = $mikrotik->testConnection();
        return response()->json($result);
    }

    public function systemResource()
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getSystemResource());
    }

    public function interfaces()
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getInterfaces());
    }

    public function interfaceTraffic(Request $request)
    {
        $interface = $request->query('interface', 'ether1');
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getInterfaceTraffic($interface));
    }

    public function activeConnections()
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getActiveConnections());
    }

    public function disconnectUser(Request $request)
    {
        $request->validate(['name' => 'required|string']);
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->disconnectUser($request->name));
    }

    public function profiles()
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getProfiles());
    }

    // PPPoE Secrets
    public function secrets()
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->getPPPoESecrets());
    }

    public function createSecret(Request $request)
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
            'service' => 'nullable|string',
            'profile' => 'nullable|string',
            'local_address' => 'nullable|string',
            'remote_address' => 'nullable|string',
            'comment' => 'nullable|string',
        ]);

        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->createPPPoESecret($validated));
    }

    public function updateSecret(Request $request, string $id)
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->updatePPPoESecret($id, $request->all()));
    }

    public function deleteSecret(string $id)
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->deletePPPoESecret($id));
    }

    public function enableSecret(string $id)
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->enablePPPoESecret($id));
    }

    public function disableSecret(string $id)
    {
        $mikrotik = new MikrotikService();
        $mikrotik->connect();
        return response()->json($mikrotik->disablePPPoESecret($id));
    }
}
```

### MidtransController (app/Http/Controllers/Api/MidtransController.php)
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Services\MidtransService;
use Illuminate\Http\Request;

class MidtransController extends Controller
{
    public function createToken(Request $request)
    {
        $request->validate(['invoice_id' => 'required|uuid']);
        
        $invoice = Invoice::findOrFail($request->invoice_id);
        $midtrans = new MidtransService();
        
        return response()->json($midtrans->createSnapToken($invoice));
    }

    public function notification(Request $request)
    {
        $midtrans = new MidtransService();
        $result = $midtrans->handleNotification($request->all());
        return response()->json($result);
    }

    public function checkStatus(string $orderId)
    {
        $midtrans = new MidtransService();
        return response()->json($midtrans->checkStatus($orderId));
    }

    public function cancel(string $orderId)
    {
        $midtrans = new MidtransService();
        return response()->json($midtrans->cancelTransaction($orderId));
    }
}
```

### Additional Controllers to Create:
- PackageController
- SubscriptionController
- InvoiceController
- PaymentController
- RouterSettingController
- MikrotikSecretController
- DashboardController
- SnmpDeviceController
- PingTargetController
- AlertController
- NotificationSettingController

---

## 7. API Routes (routes/api.php)

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\PackageController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\MikrotikController;
use App\Http\Controllers\Api\MikrotikSecretController;
use App\Http\Controllers\Api\RouterSettingController;
use App\Http\Controllers\Api\MidtransController;
use App\Http\Controllers\Api\DashboardController;

// Public Routes
Route::post('/login', [AuthController::class, 'login']);

// Midtrans Webhook (no auth required)
Route::post('/midtrans/notification', [MidtransController::class, 'notification']);

// Protected Routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Dashboard
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/recent-activities', [DashboardController::class, 'recentActivities']);

    // Customers
    Route::apiResource('customers', CustomerController::class);

    // Packages
    Route::apiResource('packages', PackageController::class);

    // Subscriptions
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('/subscriptions/{subscription}/suspend', [SubscriptionController::class, 'suspend']);
    Route::post('/subscriptions/{subscription}/activate', [SubscriptionController::class, 'activate']);

    // Invoices
    Route::apiResource('invoices', InvoiceController::class);
    Route::post('/invoices/{invoice}/mark-paid', [InvoiceController::class, 'markPaid']);

    // Payments
    Route::apiResource('payments', PaymentController::class);

    // MikroTik
    Route::prefix('mikrotik')->group(function () {
        Route::get('/test', [MikrotikController::class, 'testConnection']);
        Route::get('/system', [MikrotikController::class, 'systemResource']);
        Route::get('/interfaces', [MikrotikController::class, 'interfaces']);
        Route::get('/interface-traffic', [MikrotikController::class, 'interfaceTraffic']);
        Route::get('/active', [MikrotikController::class, 'activeConnections']);
        Route::post('/disconnect', [MikrotikController::class, 'disconnectUser']);
        Route::get('/profiles', [MikrotikController::class, 'profiles']);
        
        // Secrets
        Route::get('/secrets', [MikrotikController::class, 'secrets']);
        Route::post('/secrets', [MikrotikController::class, 'createSecret']);
        Route::put('/secrets/{id}', [MikrotikController::class, 'updateSecret']);
        Route::delete('/secrets/{id}', [MikrotikController::class, 'deleteSecret']);
        Route::post('/secrets/{id}/enable', [MikrotikController::class, 'enableSecret']);
        Route::post('/secrets/{id}/disable', [MikrotikController::class, 'disableSecret']);
    });

    // MikroTik Secrets (Database)
    Route::apiResource('mikrotik-secrets', MikrotikSecretController::class);
    Route::post('/mikrotik-secrets/{secret}/sync', [MikrotikSecretController::class, 'syncToRouter']);

    // Router Settings
    Route::apiResource('router-settings', RouterSettingController::class);
    Route::post('/router-settings/{router}/test', [RouterSettingController::class, 'testConnection']);

    // Midtrans
    Route::prefix('midtrans')->group(function () {
        Route::post('/create-token', [MidtransController::class, 'createToken']);
        Route::get('/status/{orderId}', [MidtransController::class, 'checkStatus']);
        Route::post('/cancel/{orderId}', [MidtransController::class, 'cancel']);
    });

    // SNMP Monitoring (optional, for future)
    // Route::apiResource('snmp-devices', SnmpDeviceController::class);
    // Route::apiResource('ping-targets', PingTargetController::class);
    // Route::get('/alerts', [AlertController::class, 'index']);
});
```

---

## 8. Config Files

### config/services.php (add Midtrans)
```php
<?php

return [
    // ... existing services ...

    'midtrans' => [
        'server_key' => env('MIDTRANS_SERVER_KEY'),
        'client_key' => env('MIDTRANS_CLIENT_KEY'),
        'is_production' => env('MIDTRANS_IS_PRODUCTION', false),
        'merchant_id' => env('MIDTRANS_MERCHANT_ID'),
    ],
];
```

---

## 9. Console Commands

### ProcessSubscriptions (app/Console/Commands/ProcessSubscriptions.php)
```php
<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\Invoice;
use App\Services\MikrotikService;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class ProcessSubscriptions extends Command
{
    protected $signature = 'subscriptions:process';
    protected $description = 'Process subscriptions: check expiry, generate invoices, suspend overdue';

    public function handle()
    {
        $this->info('Processing subscriptions...');

        // 1. Suspend overdue subscriptions
        $this->suspendOverdue();

        // 2. Generate renewal invoices
        $this->generateRenewalInvoices();

        // 3. Mark invoices as overdue
        $this->markOverdueInvoices();

        $this->info('Done!');
    }

    private function suspendOverdue(): void
    {
        $overdueSubscriptions = Subscription::where('status', 'active')
            ->whereHas('invoices', function ($q) {
                $q->where('status', 'overdue');
            })
            ->get();

        $mikrotik = null;
        try {
            $mikrotik = new MikrotikService();
            $mikrotik->connect();
        } catch (\Exception $e) {
            $this->error('Could not connect to MikroTik: ' . $e->getMessage());
        }

        foreach ($overdueSubscriptions as $subscription) {
            $subscription->update(['status' => 'suspended']);

            if ($mikrotik) {
                try {
                    $secrets = $mikrotik->getPPPoESecrets();
                    foreach ($secrets as $secret) {
                        if ($secret['name'] === $subscription->mikrotik_username) {
                            $mikrotik->disablePPPoESecret($secret['.id']);
                            break;
                        }
                    }
                } catch (\Exception $e) {
                    $this->error('Failed to disable MikroTik user: ' . $e->getMessage());
                }
            }

            $this->info("Suspended subscription: {$subscription->mikrotik_username}");
        }
    }

    private function generateRenewalInvoices(): void
    {
        // Get subscriptions expiring in 7 days with auto_renew
        $subscriptions = Subscription::where('status', 'active')
            ->where('auto_renew', true)
            ->whereBetween('end_date', [now(), now()->addDays(7)])
            ->whereDoesntHave('invoices', function ($q) {
                $q->where('status', 'unpaid')
                  ->where('created_at', '>=', now()->subDays(7));
            })
            ->with('package')
            ->get();

        foreach ($subscriptions as $subscription) {
            Invoice::create([
                'id' => Str::uuid(),
                'invoice_number' => Invoice::generateInvoiceNumber(),
                'subscription_id' => $subscription->id,
                'amount' => $subscription->package->price,
                'due_date' => $subscription->end_date,
                'status' => 'unpaid',
            ]);

            $this->info("Generated invoice for: {$subscription->mikrotik_username}");
        }
    }

    private function markOverdueInvoices(): void
    {
        Invoice::where('status', 'unpaid')
            ->where('due_date', '<', now())
            ->update(['status' => 'overdue']);
    }
}
```

### Kernel Schedule (app/Console/Kernel.php)
```php
<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        // Run subscription processing daily at midnight
        $schedule->command('subscriptions:process')->dailyAt('00:00');
        
        // SNMP polling every 5 minutes (optional)
        // $schedule->command('snmp:poll')->everyFiveMinutes();
        
        // Ping monitoring every minute (optional)
        // $schedule->command('ping:targets')->everyMinute();
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
        require base_path('routes/console.php');
    }
}
```

---

## 10. Running Locally (XAMPP)

### Start Services
1. Start Apache dan MySQL di XAMPP Control Panel
2. Buka browser: http://localhost/phpmyadmin
3. Create database: `isp_billing`

### Setup Laravel
```bash
cd C:\\xampp\\htdocs\\isp-billing-api

# Install dependencies
composer install

# Generate app key
php artisan key:generate

# Run migrations
php artisan migrate

# Seed database
php artisan db:seed

# Clear cache
php artisan config:clear
php artisan cache:clear
```

### Test API
```bash
# Atau buka di browser/Postman
http://localhost/isp-billing-api/public/api/login

# POST dengan body:
{
    "email": "admin@ispbilling.com",
    "password": "admin123"
}
```

### Run Scheduler Locally (untuk testing)
```bash
# Manual run
php artisan subscriptions:process

# Watch mode (setiap menit)
php artisan schedule:work
```

---

## 11. Frontend Integration

### Update .env di Frontend React
```env
VITE_API_URL=http://localhost/isp-billing-api/public/api
```

### API Client sudah di src/lib/api.ts
Sudah dikonfigurasi untuk menggunakan VITE_API_URL.

---

## 12. Production Deployment

### Server Requirements
- Ubuntu 20.04+ / CentOS 8+
- PHP 8.2+
- MySQL 8.0+ / MariaDB 10.6+
- Nginx / Apache
- Composer
- Supervisor (untuk queue)
- Certbot (untuk SSL)

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    root /var/www/isp-billing-api/public;

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
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

### Supervisor untuk Queue (optional)
```ini
[program:isp-billing-queue]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/isp-billing-api/artisan queue:work --sleep=3 --tries=3
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/isp-billing-queue.log
```

### Crontab untuk Scheduler
```bash
* * * * * cd /var/www/isp-billing-api && php artisan schedule:run >> /dev/null 2>&1
```

### Midtrans Webhook URL
```
https://api.yourdomain.com/api/midtrans/notification
```

---

## 13. Testing Checklist

### Local Testing
- [ ] Login dengan admin@ispbilling.com / admin123
- [ ] CRUD Customers
- [ ] CRUD Packages
- [ ] Test koneksi MikroTik
- [ ] Create subscription → PPPoE user auto-create
- [ ] Generate invoice
- [ ] Test Midtrans payment (sandbox)
- [ ] Test subscription suspend/activate

### Production Testing
- [ ] SSL certificate installed
- [ ] CORS working dengan frontend
- [ ] Scheduler running (check cron.log)
- [ ] Midtrans webhook receiving notifications
- [ ] MikroTik connection dari server

---

## Summary

Plan lengkap untuk Laravel backend:

1. **Database**: 15+ tables untuk billing, MikroTik, monitoring
2. **Models**: Eloquent models dengan UUID, relationships
3. **Services**: MikrotikService, MidtransService, NotificationService
4. **Controllers**: 10+ API controllers
5. **Routes**: RESTful API routes dengan Sanctum auth
6. **Commands**: Scheduled tasks untuk auto-billing
7. **Local Dev**: XAMPP setup instructions
8. **Production**: Nginx, Supervisor, Crontab config

Frontend sudah siap dengan `src/lib/api.ts` untuk integrasi.
