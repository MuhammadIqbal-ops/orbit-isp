# Complete Laravel Backend Guide for ISP Billing System
## MikroTik Integration + Midtrans Payment + Full CRUD

This guide covers everything from installation to production deployment.

---

## Table of Contents
1. [Requirements & Installation](#1-requirements--installation)
2. [Database Setup](#2-database-setup)
3. [Laravel Project Structure](#3-laravel-project-structure)
4. [Models & Migrations](#4-models--migrations)
5. [Services](#5-services)
6. [Controllers](#6-controllers)
7. [API Routes](#7-api-routes)
8. [MikroTik Integration](#8-mikrotik-integration)
9. [Midtrans Payment Integration](#9-midtrans-payment-integration)
10. [Frontend Integration](#10-frontend-integration)
11. [Testing & Deployment](#11-testing--deployment)

---

## 1. Requirements & Installation

### System Requirements
- PHP 8.2+
- Composer 2.x
- MySQL 8.0+ / MariaDB 10.6+
- Node.js 18+ (for frontend)
- XAMPP/Laragon (for local development)

### Install Laravel Project

```bash
# Create new Laravel project
composer create-project laravel/laravel isp-billing

cd isp-billing

# Install required packages
composer require laravel/sanctum
composer require evilfreelancer/routeros-api-php
composer require midtrans/midtrans-php

# Publish Sanctum config
php artisan vendor:publish --provider="Laravel\\Sanctum\\SanctumServiceProvider"
```

### Environment Configuration (.env)

```env
APP_NAME="ISP Billing System"
APP_ENV=local
APP_KEY=base64:generate-with-artisan
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database (XAMPP MySQL)
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=root
DB_PASSWORD=

# Frontend URL for CORS
FRONTEND_URL=http://localhost:8080

# MikroTik Router Settings
MIKROTIK_HOST=192.168.88.1
MIKROTIK_USER=admin
MIKROTIK_PASS=
MIKROTIK_PORT=8728

# Midtrans Settings
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js

# Notification Settings
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=noreply@yourisp.com
```

### CORS Configuration (config/cors.php)

```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:8080')],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

---

## 2. Database Setup

### Create Database

```sql
-- Login to MySQL via phpMyAdmin or command line
CREATE DATABASE isp_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Run Migrations

```bash
php artisan migrate
```

---

## 3. Laravel Project Structure

```
isp-billing/
├── app/
│   ├── Console/
│   │   └── Commands/
│   │       └── ProcessSubscriptions.php
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── Api/
│   │   │       ├── AuthController.php
│   │   │       ├── CustomerController.php
│   │   │       ├── PackageController.php
│   │   │       ├── SubscriptionController.php
│   │   │       ├── InvoiceController.php
│   │   │       ├── PaymentController.php
│   │   │       ├── MikrotikController.php
│   │   │       ├── MidtransController.php
│   │   │       ├── RouterSettingController.php
│   │   │       └── DashboardController.php
│   │   └── Middleware/
│   ├── Models/
│   │   ├── User.php
│   │   ├── Customer.php
│   │   ├── Package.php
│   │   ├── Subscription.php
│   │   ├── Invoice.php
│   │   ├── Payment.php
│   │   ├── RouterSetting.php
│   │   ├── MikrotikSecret.php
│   │   └── BillingLog.php
│   ├── Services/
│   │   ├── MikrotikService.php
│   │   ├── MidtransService.php
│   │   └── NotificationService.php
│   └── Traits/
│       └── HasUuid.php
├── database/
│   ├── migrations/
│   └── seeders/
├── routes/
│   └── api.php
└── config/
    └── services.php
```

---

## 4. Models & Migrations

### HasUuid Trait (app/Traits/HasUuid.php)

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

### Migration: Customers Table

```bash
php artisan make:migration create_customers_table
```

```php
<?php
// database/migrations/xxxx_create_customers_table.php

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

### Migration: Packages Table

```bash
php artisan make:migration create_packages_table
```

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
            $table->decimal('price', 12, 2);
            $table->string('bandwidth'); // e.g., "10M/10M"
            $table->string('burst')->nullable(); // e.g., "15M/15M"
            $table->enum('type', ['pppoe', 'hotspot', 'static'])->default('pppoe');
            $table->integer('priority')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packages');
    }
};
```

### Migration: Subscriptions Table

```bash
php artisan make:migration create_subscriptions_table
```

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
            $table->string('mikrotik_username');
            $table->string('mikrotik_password');
            $table->date('start_date');
            $table->date('end_date');
            $table->enum('status', ['active', 'expired', 'suspended', 'pending'])->default('active');
            $table->boolean('auto_renew')->default(true);
            $table->timestamps();
            
            $table->foreign('customer_id')->references('id')->on('customers')->onDelete('cascade');
            $table->foreign('package_id')->references('id')->on('packages')->onDelete('restrict');
            $table->index(['status', 'end_date']);
            $table->unique('mikrotik_username');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
    }
};
```

### Migration: Invoices Table

```bash
php artisan make:migration create_invoices_table
```

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
            $table->uuid('subscription_id');
            $table->decimal('amount', 12, 2);
            $table->date('due_date');
            $table->enum('status', ['unpaid', 'paid', 'overdue', 'cancelled'])->default('unpaid');
            $table->text('notes')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_url')->nullable();
            $table->string('snap_token')->nullable();
            $table->timestamps();
            
            $table->foreign('subscription_id')->references('id')->on('subscriptions')->onDelete('cascade');
            $table->index(['status', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
```

### Migration: Payments Table

```bash
php artisan make:migration create_payments_table
```

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
            $table->enum('method', ['cash', 'transfer', 'midtrans', 'qris', 'va', 'ewallet']);
            $table->string('transaction_id')->nullable();
            $table->timestamp('payment_date')->useCurrent();
            $table->json('midtrans_response')->nullable();
            $table->timestamps();
            
            $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('cascade');
            $table->index('transaction_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
```

### Migration: Router Settings Table

```bash
php artisan make:migration create_router_settings_table
```

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('router_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('host');
            $table->integer('port')->default(8728);
            $table->string('username');
            $table->string('password');
            $table->boolean('ssl')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('router_settings');
    }
};
```

### Migration: Billing Logs Table

```bash
php artisan make:migration create_billing_logs_table
```

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('subscription_id')->nullable();
            $table->uuid('invoice_id')->nullable();
            $table->string('action');
            $table->text('message');
            $table->json('meta')->nullable();
            $table->timestamps();
            
            $table->index(['action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_logs');
    }
};
```

### Customer Model (app/Models/Customer.php)

```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasUuid;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'address',
        'status',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function activeSubscription()
    {
        return $this->subscriptions()->where('status', 'active')->first();
    }
}
```

### Package Model (app/Models/Package.php)

```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    use HasUuid;

    protected $fillable = [
        'name',
        'price',
        'bandwidth',
        'burst',
        'type',
        'priority',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'priority' => 'integer',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
```

### Subscription Model (app/Models/Subscription.php)

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

    protected $fillable = [
        'customer_id',
        'package_id',
        'mikrotik_username',
        'mikrotik_password',
        'start_date',
        'end_date',
        'status',
        'auto_renew',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'auto_renew' => 'boolean',
    ];

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

    public function isExpired(): bool
    {
        return $this->end_date->isPast();
    }

    public function daysUntilExpiry(): int
    {
        return now()->diffInDays($this->end_date, false);
    }
}
```

### Invoice Model (app/Models/Invoice.php)

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

    protected $fillable = [
        'subscription_id',
        'amount',
        'due_date',
        'status',
        'notes',
        'payment_reference',
        'payment_url',
        'snap_token',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'due_date' => 'date',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function isOverdue(): bool
    {
        return $this->status === 'unpaid' && $this->due_date->isPast();
    }

    public function markAsPaid(string $transactionId = null): void
    {
        $this->update([
            'status' => 'paid',
            'payment_reference' => $transactionId,
        ]);
    }
}
```

### Payment Model (app/Models/Payment.php)

```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use HasUuid;

    protected $fillable = [
        'invoice_id',
        'amount',
        'method',
        'transaction_id',
        'payment_date',
        'midtrans_response',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'datetime',
        'midtrans_response' => 'array',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
```

### Router Setting Model (app/Models/RouterSetting.php)

```php
<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class RouterSetting extends Model
{
    use HasUuid;

    protected $fillable = [
        'host',
        'port',
        'username',
        'password',
        'ssl',
    ];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'port' => 'integer',
        'ssl' => 'boolean',
    ];
}
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

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create admin user
        User::create([
            'name' => 'Admin',
            'email' => 'admin@isp.local',
            'password' => Hash::make('password'),
        ]);

        // Create default packages
        $packages = [
            ['name' => '10 Mbps', 'price' => 150000, 'bandwidth' => '10M/10M', 'type' => 'pppoe'],
            ['name' => '20 Mbps', 'price' => 250000, 'bandwidth' => '20M/20M', 'type' => 'pppoe'],
            ['name' => '50 Mbps', 'price' => 400000, 'bandwidth' => '50M/50M', 'type' => 'pppoe'],
            ['name' => '100 Mbps', 'price' => 600000, 'bandwidth' => '100M/100M', 'type' => 'pppoe'],
        ];

        foreach ($packages as $package) {
            Package::create($package);
        }

        // Create default router settings
        RouterSetting::create([
            'host' => env('MIKROTIK_HOST', '192.168.88.1'),
            'port' => env('MIKROTIK_PORT', 8728),
            'username' => env('MIKROTIK_USER', 'admin'),
            'password' => env('MIKROTIK_PASS', ''),
            'ssl' => false,
        ]);
    }
}
```

---

## 5. Services

### MikroTik Service (app/Services/MikrotikService.php)

```php
<?php

namespace App\Services;

use App\Models\RouterSetting;
use RouterOS\Client;
use RouterOS\Query;
use Exception;

class MikrotikService
{
    protected ?Client $client = null;
    protected ?RouterSetting $settings = null;

    public function connect(): self
    {
        $this->settings = RouterSetting::first();
        
        if (!$this->settings) {
            throw new Exception('Router settings not configured');
        }

        try {
            $this->client = new Client([
                'host' => $this->settings->host,
                'user' => $this->settings->username,
                'pass' => $this->settings->password,
                'port' => $this->settings->port,
                'ssl' => $this->settings->ssl,
                'legacy' => true, // For RouterOS v6 compatibility
                'timeout' => 10,
            ]);
        } catch (Exception $e) {
            throw new Exception('Failed to connect to MikroTik: ' . $e->getMessage());
        }

        return $this;
    }

    public function disconnect(): void
    {
        $this->client = null;
    }

    // ==================== SYSTEM ====================

    public function getSystemResource(): array
    {
        $this->ensureConnected();
        
        $query = new Query('/system/resource/print');
        $response = $this->client->query($query)->read();
        
        return $response[0] ?? [];
    }

    public function getSystemIdentity(): string
    {
        $this->ensureConnected();
        
        $query = new Query('/system/identity/print');
        $response = $this->client->query($query)->read();
        
        return $response[0]['name'] ?? 'Unknown';
    }

    // ==================== PPPoE SECRETS ====================

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

        return ['success' => true, 'id' => $response['after']['ret'] ?? null];
    }

    public function updatePPPoESecret(string $id, array $data): array
    {
        $this->ensureConnected();

        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $id);

        foreach ($data as $key => $value) {
            $mikrotikKey = str_replace('_', '-', $key);
            $query->equal($mikrotikKey, $value);
        }

        $this->client->query($query)->read();

        return ['success' => true];
    }

    public function deletePPPoESecret(string $id): array
    {
        $this->ensureConnected();

        $query = (new Query('/ppp/secret/remove'))
            ->equal('.id', $id);

        $this->client->query($query)->read();

        return ['success' => true];
    }

    public function enablePPPoESecret(string $username): array
    {
        $this->ensureConnected();

        // Find secret by name
        $query = (new Query('/ppp/secret/print'))
            ->where('name', $username);
        $secrets = $this->client->query($query)->read();

        if (empty($secrets)) {
            throw new Exception("PPPoE secret not found: {$username}");
        }

        $id = $secrets[0]['.id'];

        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $id)
            ->equal('disabled', 'no');

        $this->client->query($query)->read();

        return ['success' => true];
    }

    public function disablePPPoESecret(string $username): array
    {
        $this->ensureConnected();

        // Find secret by name
        $query = (new Query('/ppp/secret/print'))
            ->where('name', $username);
        $secrets = $this->client->query($query)->read();

        if (empty($secrets)) {
            throw new Exception("PPPoE secret not found: {$username}");
        }

        $id = $secrets[0]['.id'];

        $query = (new Query('/ppp/secret/set'))
            ->equal('.id', $id)
            ->equal('disabled', 'yes');

        $this->client->query($query)->read();

        // Kick active session
        $this->kickPPPoEUser($username);

        return ['success' => true];
    }

    // ==================== ACTIVE CONNECTIONS ====================

    public function getActiveConnections(): array
    {
        $this->ensureConnected();

        $query = new Query('/ppp/active/print');
        return $this->client->query($query)->read();
    }

    public function kickPPPoEUser(string $username): array
    {
        $this->ensureConnected();

        $query = (new Query('/ppp/active/print'))
            ->where('name', $username);
        $active = $this->client->query($query)->read();

        if (!empty($active)) {
            $query = (new Query('/ppp/active/remove'))
                ->equal('.id', $active[0]['.id']);
            $this->client->query($query)->read();
        }

        return ['success' => true, 'was_active' => !empty($active)];
    }

    // ==================== PROFILES ====================

    public function getProfiles(): array
    {
        $this->ensureConnected();

        $query = new Query('/ppp/profile/print');
        return $this->client->query($query)->read();
    }

    public function createProfile(array $data): array
    {
        $this->ensureConnected();

        $query = (new Query('/ppp/profile/add'))
            ->equal('name', $data['name']);

        if (!empty($data['rate_limit'])) {
            $query->equal('rate-limit', $data['rate_limit']);
        }
        if (!empty($data['local_address'])) {
            $query->equal('local-address', $data['local_address']);
        }
        if (!empty($data['remote_address'])) {
            $query->equal('remote-address', $data['remote_address']);
        }

        $response = $this->client->query($query)->read();

        return ['success' => true, 'id' => $response['after']['ret'] ?? null];
    }

    // ==================== SIMPLE QUEUES ====================

    public function getSimpleQueues(): array
    {
        $this->ensureConnected();

        $query = new Query('/queue/simple/print');
        return $this->client->query($query)->read();
    }

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

        return ['success' => true, 'id' => $response['after']['ret'] ?? null];
    }

    public function deleteSimpleQueue(string $name): array
    {
        $this->ensureConnected();

        $query = (new Query('/queue/simple/print'))
            ->where('name', $name);
        $queues = $this->client->query($query)->read();

        if (!empty($queues)) {
            $query = (new Query('/queue/simple/remove'))
                ->equal('.id', $queues[0]['.id']);
            $this->client->query($query)->read();
        }

        return ['success' => true];
    }

    // ==================== INTERFACES ====================

    public function getInterfaces(): array
    {
        $this->ensureConnected();

        $query = new Query('/interface/print');
        return $this->client->query($query)->read();
    }

    public function getInterfaceTraffic(string $interface): array
    {
        $this->ensureConnected();

        $query = (new Query('/interface/monitor-traffic'))
            ->equal('interface', $interface)
            ->equal('once', '');

        $response = $this->client->query($query)->read();

        return $response[0] ?? [];
    }

    // ==================== HOTSPOT ====================

    public function getHotspotUsers(): array
    {
        $this->ensureConnected();

        $query = new Query('/ip/hotspot/user/print');
        return $this->client->query($query)->read();
    }

    public function createHotspotUser(array $data): array
    {
        $this->ensureConnected();

        $query = (new Query('/ip/hotspot/user/add'))
            ->equal('name', $data['username'])
            ->equal('password', $data['password']);

        if (!empty($data['profile'])) {
            $query->equal('profile', $data['profile']);
        }
        if (!empty($data['limit_uptime'])) {
            $query->equal('limit-uptime', $data['limit_uptime']);
        }
        if (!empty($data['limit_bytes_total'])) {
            $query->equal('limit-bytes-total', $data['limit_bytes_total']);
        }
        if (!empty($data['comment'])) {
            $query->equal('comment', $data['comment']);
        }

        $response = $this->client->query($query)->read();

        return ['success' => true, 'id' => $response['after']['ret'] ?? null];
    }

    // ==================== DHCP LEASES ====================

    public function getDHCPLeases(): array
    {
        $this->ensureConnected();

        $query = new Query('/ip/dhcp-server/lease/print');
        return $this->client->query($query)->read();
    }

    // ==================== HELPER ====================

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
            $identity = $this->getSystemIdentity();
            $resource = $this->getSystemResource();

            return [
                'success' => true,
                'identity' => $identity,
                'version' => $resource['version'] ?? 'Unknown',
                'uptime' => $resource['uptime'] ?? 'Unknown',
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
```

### Midtrans Service (app/Services/MidtransService.php)

```php
<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\BillingLog;
use Midtrans\Config;
use Midtrans\Snap;
use Midtrans\Transaction;
use Midtrans\Notification;
use Exception;

class MidtransService
{
    public function __construct()
    {
        Config::$serverKey = config('services.midtrans.server_key');
        Config::$clientKey = config('services.midtrans.client_key');
        Config::$isProduction = config('services.midtrans.is_production');
        Config::$isSanitized = true;
        Config::$is3ds = true;
    }

    public function createSnapToken(Invoice $invoice, array $customerDetails = []): array
    {
        $subscription = $invoice->subscription;
        $customer = $subscription->customer;

        $orderId = 'INV-' . $invoice->id . '-' . time();

        $params = [
            'transaction_details' => [
                'order_id' => $orderId,
                'gross_amount' => (int) $invoice->amount,
            ],
            'customer_details' => [
                'first_name' => $customerDetails['name'] ?? $customer->name,
                'email' => $customerDetails['email'] ?? $customer->email,
                'phone' => $customerDetails['phone'] ?? $customer->phone,
            ],
            'item_details' => [
                [
                    'id' => $subscription->package_id,
                    'price' => (int) $invoice->amount,
                    'quantity' => 1,
                    'name' => 'Internet - ' . $subscription->package->name,
                ],
            ],
            'callbacks' => [
                'finish' => config('services.midtrans.finish_url'),
            ],
        ];

        try {
            $snapToken = Snap::getSnapToken($params);

            // Update invoice with snap token
            $invoice->update([
                'snap_token' => $snapToken,
                'payment_reference' => $orderId,
                'payment_url' => config('services.midtrans.snap_url') . '?token=' . $snapToken,
            ]);

            BillingLog::create([
                'invoice_id' => $invoice->id,
                'subscription_id' => $subscription->id,
                'action' => 'snap_token_created',
                'message' => "Snap token created for invoice {$invoice->id}",
                'meta' => ['order_id' => $orderId],
            ]);

            return [
                'success' => true,
                'snap_token' => $snapToken,
                'order_id' => $orderId,
                'redirect_url' => config('services.midtrans.snap_url') . '?token=' . $snapToken,
            ];
        } catch (Exception $e) {
            BillingLog::create([
                'invoice_id' => $invoice->id,
                'action' => 'snap_token_error',
                'message' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    public function handleNotification(): array
    {
        try {
            $notification = new Notification();

            $transactionStatus = $notification->transaction_status;
            $orderId = $notification->order_id;
            $fraudStatus = $notification->fraud_status ?? null;
            $paymentType = $notification->payment_type;

            // Extract invoice ID from order_id (format: INV-{uuid}-{timestamp})
            preg_match('/INV-([a-f0-9-]+)-/', $orderId, $matches);
            $invoiceId = $matches[1] ?? null;

            if (!$invoiceId) {
                throw new Exception('Invalid order ID format');
            }

            $invoice = Invoice::findOrFail($invoiceId);
            $subscription = $invoice->subscription;

            BillingLog::create([
                'invoice_id' => $invoice->id,
                'subscription_id' => $subscription->id,
                'action' => 'midtrans_notification',
                'message' => "Received notification: {$transactionStatus}",
                'meta' => [
                    'order_id' => $orderId,
                    'transaction_status' => $transactionStatus,
                    'payment_type' => $paymentType,
                    'fraud_status' => $fraudStatus,
                ],
            ]);

            $result = match ($transactionStatus) {
                'capture' => $this->handleCapture($invoice, $notification, $fraudStatus),
                'settlement' => $this->handleSettlement($invoice, $notification),
                'pending' => $this->handlePending($invoice),
                'deny', 'cancel', 'expire' => $this->handleFailed($invoice, $transactionStatus),
                default => ['success' => true, 'message' => 'Unhandled status'],
            };

            return $result;
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    protected function handleCapture(Invoice $invoice, Notification $notification, ?string $fraudStatus): array
    {
        if ($fraudStatus === 'accept' || $notification->payment_type === 'credit_card') {
            return $this->processSuccessPayment($invoice, $notification);
        }

        return ['success' => true, 'message' => 'Waiting for fraud check'];
    }

    protected function handleSettlement(Invoice $invoice, Notification $notification): array
    {
        return $this->processSuccessPayment($invoice, $notification);
    }

    protected function processSuccessPayment(Invoice $invoice, Notification $notification): array
    {
        // Create payment record
        Payment::create([
            'invoice_id' => $invoice->id,
            'amount' => $notification->gross_amount,
            'method' => $this->mapPaymentType($notification->payment_type),
            'transaction_id' => $notification->transaction_id,
            'payment_date' => now(),
            'midtrans_response' => json_decode(json_encode($notification), true),
        ]);

        // Update invoice status
        $invoice->update(['status' => 'paid']);

        // Re-enable MikroTik user if suspended
        $subscription = $invoice->subscription;
        if ($subscription->status === 'suspended') {
            try {
                $mikrotik = new MikrotikService();
                $mikrotik->enablePPPoESecret($subscription->mikrotik_username);

                $subscription->update(['status' => 'active']);

                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'invoice_id' => $invoice->id,
                    'action' => 'user_reactivated',
                    'message' => "User {$subscription->mikrotik_username} reactivated after payment",
                ]);
            } catch (Exception $e) {
                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'action' => 'reactivation_error',
                    'message' => $e->getMessage(),
                ]);
            }
        }

        // Send notification
        app(NotificationService::class)->sendPaymentConfirmation($invoice);

        return ['success' => true, 'message' => 'Payment processed successfully'];
    }

    protected function handlePending(Invoice $invoice): array
    {
        // Invoice already unpaid, just log
        BillingLog::create([
            'invoice_id' => $invoice->id,
            'action' => 'payment_pending',
            'message' => 'Payment pending confirmation',
        ]);

        return ['success' => true, 'message' => 'Payment pending'];
    }

    protected function handleFailed(Invoice $invoice, string $status): array
    {
        BillingLog::create([
            'invoice_id' => $invoice->id,
            'action' => 'payment_failed',
            'message' => "Payment {$status}",
        ]);

        return ['success' => true, 'message' => "Payment {$status}"];
    }

    protected function mapPaymentType(string $type): string
    {
        return match ($type) {
            'credit_card', 'debit_card' => 'midtrans',
            'bank_transfer', 'echannel' => 'va',
            'gopay', 'shopeepay', 'dana', 'ovo' => 'ewallet',
            'qris' => 'qris',
            default => 'midtrans',
        };
    }

    public function checkTransactionStatus(string $orderId): array
    {
        try {
            $status = Transaction::status($orderId);
            return [
                'success' => true,
                'data' => $status,
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    public function cancelTransaction(string $orderId): array
    {
        try {
            $cancel = Transaction::cancel($orderId);
            return [
                'success' => true,
                'data' => $cancel,
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
```

### Notification Service (app/Services/NotificationService.php)

```php
<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Subscription;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    public function sendPaymentConfirmation(Invoice $invoice): void
    {
        $subscription = $invoice->subscription;
        $customer = $subscription->customer;

        $message = "✅ *Payment Confirmed*\n\n"
            . "Customer: {$customer->name}\n"
            . "Package: {$subscription->package->name}\n"
            . "Amount: Rp " . number_format($invoice->amount, 0, ',', '.') . "\n"
            . "Invoice: #{$invoice->id}";

        $this->sendTelegram($message);

        if ($customer->email) {
            // Send email notification (implement as needed)
        }
    }

    public function sendExpiryWarning(Subscription $subscription, int $daysLeft): void
    {
        $customer = $subscription->customer;

        $message = "⚠️ *Subscription Expiring*\n\n"
            . "Customer: {$customer->name}\n"
            . "Package: {$subscription->package->name}\n"
            . "Expires in: {$daysLeft} days\n"
            . "End Date: {$subscription->end_date->format('d M Y')}";

        $this->sendTelegram($message);
    }

    public function sendSuspensionNotice(Subscription $subscription): void
    {
        $customer = $subscription->customer;

        $message = "🔴 *Service Suspended*\n\n"
            . "Customer: {$customer->name}\n"
            . "Username: {$subscription->mikrotik_username}\n"
            . "Reason: Overdue payment";

        $this->sendTelegram($message);
    }

    protected function sendTelegram(string $message): void
    {
        $botToken = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        if (!$botToken || !$chatId) {
            return;
        }

        try {
            Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $message,
                'parse_mode' => 'Markdown',
            ]);
        } catch (\Exception $e) {
            // Log error but don't throw
            logger()->error('Telegram notification failed: ' . $e->getMessage());
        }
    }
}
```

---

## 6. Controllers

### Auth Controller (app/Http/Controllers/Api/AuthController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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

        $token = $user->createToken('api-token')->plainTextToken;

        return response()->json([
            'success' => true,
            'data' => [
                'user' => $user,
                'token' => $token,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully',
        ]);
    }

    public function user(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => $request->user(),
        ]);
    }
}
```

### Customer Controller (app/Http/Controllers/Api/CustomerController.php)

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
        $query = Customer::with('subscriptions.package');

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $customers = $query->orderBy('created_at', 'desc')->paginate($request->per_page ?? 10);

        return response()->json([
            'success' => true,
            'data' => $customers,
        ]);
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

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Customer created successfully',
        ], 201);
    }

    public function show(Customer $customer)
    {
        $customer->load('subscriptions.package', 'subscriptions.invoices');

        return response()->json([
            'success' => true,
            'data' => $customer,
        ]);
    }

    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,suspended',
        ]);

        $customer->update($validated);

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Customer updated successfully',
        ]);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->json([
            'success' => true,
            'message' => 'Customer deleted successfully',
        ]);
    }
}
```

### Package Controller (app/Http/Controllers/Api/PackageController.php)

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
        $packages = Package::orderBy('price')->get();

        return response()->json([
            'success' => true,
            'data' => $packages,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'bandwidth' => 'required|string|max:50',
            'burst' => 'nullable|string|max:50',
            'type' => 'required|in:pppoe,hotspot,static',
            'priority' => 'nullable|integer|min:1|max:8',
        ]);

        $package = Package::create($validated);

        return response()->json([
            'success' => true,
            'data' => $package,
            'message' => 'Package created successfully',
        ], 201);
    }

    public function show(Package $package)
    {
        return response()->json([
            'success' => true,
            'data' => $package,
        ]);
    }

    public function update(Request $request, Package $package)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'price' => 'sometimes|required|numeric|min:0',
            'bandwidth' => 'sometimes|required|string|max:50',
            'burst' => 'nullable|string|max:50',
            'type' => 'sometimes|required|in:pppoe,hotspot,static',
            'priority' => 'nullable|integer|min:1|max:8',
        ]);

        $package->update($validated);

        return response()->json([
            'success' => true,
            'data' => $package,
            'message' => 'Package updated successfully',
        ]);
    }

    public function destroy(Package $package)
    {
        if ($package->subscriptions()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete package with active subscriptions',
            ], 422);
        }

        $package->delete();

        return response()->json([
            'success' => true,
            'message' => 'Package deleted successfully',
        ]);
    }
}
```

### Subscription Controller (app/Http/Controllers/Api/SubscriptionController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\BillingLog;
use App\Services\MikrotikService;
use Illuminate\Http\Request;
use Exception;

class SubscriptionController extends Controller
{
    public function index(Request $request)
    {
        $query = Subscription::with(['customer', 'package']);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        $subscriptions = $query->orderBy('created_at', 'desc')->paginate($request->per_page ?? 10);

        return response()->json([
            'success' => true,
            'data' => $subscriptions,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => 'required|uuid|exists:customers,id',
            'package_id' => 'required|uuid|exists:packages,id',
            'mikrotik_username' => 'required|string|max:50|unique:subscriptions',
            'mikrotik_password' => 'required|string|min:6|max:50',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after:start_date',
            'auto_renew' => 'boolean',
            'create_mikrotik_user' => 'boolean',
        ]);

        $subscription = Subscription::create([
            'customer_id' => $validated['customer_id'],
            'package_id' => $validated['package_id'],
            'mikrotik_username' => $validated['mikrotik_username'],
            'mikrotik_password' => $validated['mikrotik_password'],
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'],
            'auto_renew' => $validated['auto_renew'] ?? true,
            'status' => 'active',
        ]);

        // Create PPPoE user in MikroTik
        if ($request->boolean('create_mikrotik_user', true)) {
            try {
                $mikrotik = new MikrotikService();
                $package = $subscription->package;

                $mikrotik->createPPPoESecret([
                    'username' => $subscription->mikrotik_username,
                    'password' => $subscription->mikrotik_password,
                    'service' => $package->type,
                    'profile' => $package->name,
                    'comment' => "Customer: {$subscription->customer->name}",
                ]);

                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'action' => 'mikrotik_user_created',
                    'message' => "PPPoE user {$subscription->mikrotik_username} created",
                ]);
            } catch (Exception $e) {
                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'action' => 'mikrotik_error',
                    'message' => $e->getMessage(),
                ]);
            }
        }

        // Create initial invoice
        $package = $subscription->package;
        Invoice::create([
            'subscription_id' => $subscription->id,
            'amount' => $package->price,
            'due_date' => $subscription->start_date,
            'status' => 'unpaid',
            'notes' => 'Initial subscription invoice',
        ]);

        $subscription->load(['customer', 'package']);

        return response()->json([
            'success' => true,
            'data' => $subscription,
            'message' => 'Subscription created successfully',
        ], 201);
    }

    public function show(Subscription $subscription)
    {
        $subscription->load(['customer', 'package', 'invoices.payments']);

        return response()->json([
            'success' => true,
            'data' => $subscription,
        ]);
    }

    public function update(Request $request, Subscription $subscription)
    {
        $validated = $request->validate([
            'package_id' => 'sometimes|uuid|exists:packages,id',
            'mikrotik_password' => 'sometimes|string|min:6|max:50',
            'end_date' => 'sometimes|date',
            'auto_renew' => 'boolean',
            'status' => 'sometimes|in:active,expired,suspended,pending',
        ]);

        $subscription->update($validated);
        $subscription->load(['customer', 'package']);

        return response()->json([
            'success' => true,
            'data' => $subscription,
            'message' => 'Subscription updated successfully',
        ]);
    }

    public function destroy(Subscription $subscription)
    {
        // Disable MikroTik user before deleting
        try {
            $mikrotik = new MikrotikService();
            $mikrotik->disablePPPoESecret($subscription->mikrotik_username);
        } catch (Exception $e) {
            // Log but continue
        }

        $subscription->delete();

        return response()->json([
            'success' => true,
            'message' => 'Subscription deleted successfully',
        ]);
    }

    public function suspend(Subscription $subscription)
    {
        try {
            $mikrotik = new MikrotikService();
            $mikrotik->disablePPPoESecret($subscription->mikrotik_username);

            $subscription->update(['status' => 'suspended']);

            BillingLog::create([
                'subscription_id' => $subscription->id,
                'action' => 'subscription_suspended',
                'message' => "Subscription suspended manually",
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Subscription suspended successfully',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function activate(Subscription $subscription)
    {
        try {
            $mikrotik = new MikrotikService();
            $mikrotik->enablePPPoESecret($subscription->mikrotik_username);

            $subscription->update(['status' => 'active']);

            BillingLog::create([
                'subscription_id' => $subscription->id,
                'action' => 'subscription_activated',
                'message' => "Subscription activated manually",
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Subscription activated successfully',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
```

### Invoice Controller (app/Http/Controllers/Api/InvoiceController.php)

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
        $query = Invoice::with(['subscription.customer', 'subscription.package', 'payments']);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('subscription_id')) {
            $query->where('subscription_id', $request->subscription_id);
        }

        $invoices = $query->orderBy('created_at', 'desc')->paginate($request->per_page ?? 10);

        return response()->json([
            'success' => true,
            'data' => $invoices,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'subscription_id' => 'required|uuid|exists:subscriptions,id',
            'amount' => 'required|numeric|min:0',
            'due_date' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $invoice = Invoice::create($validated);
        $invoice->load(['subscription.customer', 'subscription.package']);

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Invoice created successfully',
        ], 201);
    }

    public function show(Invoice $invoice)
    {
        $invoice->load(['subscription.customer', 'subscription.package', 'payments']);

        return response()->json([
            'success' => true,
            'data' => $invoice,
        ]);
    }

    public function update(Request $request, Invoice $invoice)
    {
        $validated = $request->validate([
            'amount' => 'sometimes|numeric|min:0',
            'due_date' => 'sometimes|date',
            'status' => 'sometimes|in:unpaid,paid,overdue,cancelled',
            'notes' => 'nullable|string',
        ]);

        $invoice->update($validated);

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Invoice updated successfully',
        ]);
    }

    public function destroy(Invoice $invoice)
    {
        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete paid invoice',
            ], 422);
        }

        $invoice->delete();

        return response()->json([
            'success' => true,
            'message' => 'Invoice deleted successfully',
        ]);
    }
}
```

### Payment Controller (app/Http/Controllers/Api/PaymentController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Invoice;
use App\Services\MikrotikService;
use Illuminate\Http\Request;
use Exception;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = Payment::with(['invoice.subscription.customer']);

        if ($request->has('invoice_id')) {
            $query->where('invoice_id', $request->invoice_id);
        }

        $payments = $query->orderBy('payment_date', 'desc')->paginate($request->per_page ?? 10);

        return response()->json([
            'success' => true,
            'data' => $payments,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'invoice_id' => 'required|uuid|exists:invoices,id',
            'amount' => 'required|numeric|min:0',
            'method' => 'required|in:cash,transfer,midtrans,qris,va,ewallet',
            'transaction_id' => 'nullable|string',
            'payment_date' => 'nullable|date',
        ]);

        $invoice = Invoice::findOrFail($validated['invoice_id']);

        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Invoice already paid',
            ], 422);
        }

        $payment = Payment::create([
            'invoice_id' => $validated['invoice_id'],
            'amount' => $validated['amount'],
            'method' => $validated['method'],
            'transaction_id' => $validated['transaction_id'] ?? null,
            'payment_date' => $validated['payment_date'] ?? now(),
        ]);

        // Update invoice status
        $invoice->update([
            'status' => 'paid',
            'payment_reference' => $validated['transaction_id'] ?? null,
        ]);

        // Re-enable MikroTik user if suspended
        $subscription = $invoice->subscription;
        if ($subscription->status === 'suspended') {
            try {
                $mikrotik = new MikrotikService();
                $mikrotik->enablePPPoESecret($subscription->mikrotik_username);
                $subscription->update(['status' => 'active']);
            } catch (Exception $e) {
                // Log error but don't fail payment
            }
        }

        $payment->load(['invoice.subscription.customer']);

        return response()->json([
            'success' => true,
            'data' => $payment,
            'message' => 'Payment recorded successfully',
        ], 201);
    }

    public function show(Payment $payment)
    {
        $payment->load(['invoice.subscription.customer']);

        return response()->json([
            'success' => true,
            'data' => $payment,
        ]);
    }
}
```

### MikroTik Controller (app/Http/Controllers/Api/MikrotikController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MikrotikService;
use Illuminate\Http\Request;
use Exception;

class MikrotikController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;
    }

    // System
    public function systemResource()
    {
        try {
            $resource = $this->mikrotik->getSystemResource();
            $identity = $this->mikrotik->getSystemIdentity();

            return response()->json([
                'success' => true,
                'data' => [
                    'identity' => $identity,
                    ...$resource,
                ],
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function testConnection()
    {
        $result = $this->mikrotik->testConnection();

        return response()->json($result, $result['success'] ? 200 : 500);
    }

    // PPPoE Secrets
    public function secrets()
    {
        try {
            $secrets = $this->mikrotik->getPPPoESecrets();

            return response()->json([
                'success' => true,
                'data' => $secrets,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function createSecret(Request $request)
    {
        $validated = $request->validate([
            'username' => 'required|string|max:50',
            'password' => 'required|string|min:6|max:50',
            'service' => 'required|in:pppoe,any,async,l2tp,ovpn,pptp,sstp',
            'profile' => 'nullable|string',
            'local_address' => 'nullable|ip',
            'remote_address' => 'nullable|ip',
            'comment' => 'nullable|string',
        ]);

        try {
            $result = $this->mikrotik->createPPPoESecret($validated);

            return response()->json([
                'success' => true,
                'data' => $result,
                'message' => 'Secret created successfully',
            ], 201);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function enableSecret(Request $request)
    {
        $request->validate(['username' => 'required|string']);

        try {
            $result = $this->mikrotik->enablePPPoESecret($request->username);

            return response()->json([
                'success' => true,
                'message' => 'Secret enabled successfully',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function disableSecret(Request $request)
    {
        $request->validate(['username' => 'required|string']);

        try {
            $result = $this->mikrotik->disablePPPoESecret($request->username);

            return response()->json([
                'success' => true,
                'message' => 'Secret disabled successfully',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Active Connections
    public function activeConnections()
    {
        try {
            $connections = $this->mikrotik->getActiveConnections();

            return response()->json([
                'success' => true,
                'data' => $connections,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function kickUser(Request $request)
    {
        $request->validate(['username' => 'required|string']);

        try {
            $result = $this->mikrotik->kickPPPoEUser($request->username);

            return response()->json([
                'success' => true,
                'data' => $result,
                'message' => 'User disconnected',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Profiles
    public function profiles()
    {
        try {
            $profiles = $this->mikrotik->getProfiles();

            return response()->json([
                'success' => true,
                'data' => $profiles,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Interfaces
    public function interfaces()
    {
        try {
            $interfaces = $this->mikrotik->getInterfaces();

            return response()->json([
                'success' => true,
                'data' => $interfaces,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function interfaceTraffic(Request $request)
    {
        $request->validate(['interface' => 'required|string']);

        try {
            $traffic = $this->mikrotik->getInterfaceTraffic($request->interface);

            return response()->json([
                'success' => true,
                'data' => $traffic,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Simple Queues
    public function queues()
    {
        try {
            $queues = $this->mikrotik->getSimpleQueues();

            return response()->json([
                'success' => true,
                'data' => $queues,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // DHCP Leases
    public function dhcpLeases()
    {
        try {
            $leases = $this->mikrotik->getDHCPLeases();

            return response()->json([
                'success' => true,
                'data' => $leases,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Hotspot Users
    public function hotspotUsers()
    {
        try {
            $users = $this->mikrotik->getHotspotUsers();

            return response()->json([
                'success' => true,
                'data' => $users,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
```

### Midtrans Controller (app/Http/Controllers/Api/MidtransController.php)

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

    public function createSnapToken(Request $request)
    {
        $validated = $request->validate([
            'invoice_id' => 'required|uuid|exists:invoices,id',
            'customer_name' => 'nullable|string',
            'customer_email' => 'nullable|email',
            'customer_phone' => 'nullable|string',
        ]);

        $invoice = Invoice::findOrFail($validated['invoice_id']);

        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'error' => 'Invoice already paid',
            ], 422);
        }

        $result = $this->midtrans->createSnapToken($invoice, [
            'name' => $validated['customer_name'] ?? null,
            'email' => $validated['customer_email'] ?? null,
            'phone' => $validated['customer_phone'] ?? null,
        ]);

        return response()->json($result, $result['success'] ? 200 : 500);
    }

    public function notification(Request $request)
    {
        $result = $this->midtrans->handleNotification();

        return response()->json($result, $result['success'] ? 200 : 500);
    }

    public function checkStatus(Request $request)
    {
        $request->validate(['order_id' => 'required|string']);

        $result = $this->midtrans->checkTransactionStatus($request->order_id);

        return response()->json($result, $result['success'] ? 200 : 500);
    }

    public function cancel(Request $request)
    {
        $request->validate(['order_id' => 'required|string']);

        $result = $this->midtrans->cancelTransaction($request->order_id);

        return response()->json($result, $result['success'] ? 200 : 500);
    }
}
```

### Dashboard Controller (app/Http/Controllers/Api/DashboardController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats()
    {
        $totalCustomers = Customer::count();
        $activeSubscriptions = Subscription::where('status', 'active')->count();
        $unpaidInvoices = Invoice::where('status', 'unpaid')->count();
        $overdueInvoices = Invoice::where('status', 'unpaid')
            ->where('due_date', '<', now())
            ->count();

        $monthlyRevenue = Payment::whereMonth('payment_date', now()->month)
            ->whereYear('payment_date', now()->year)
            ->sum('amount');

        $recentPayments = Payment::with(['invoice.subscription.customer'])
            ->orderBy('payment_date', 'desc')
            ->limit(5)
            ->get();

        $expiringSubscriptions = Subscription::with(['customer', 'package'])
            ->where('status', 'active')
            ->whereBetween('end_date', [now(), now()->addDays(7)])
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'total_customers' => $totalCustomers,
                'active_subscriptions' => $activeSubscriptions,
                'unpaid_invoices' => $unpaidInvoices,
                'overdue_invoices' => $overdueInvoices,
                'monthly_revenue' => $monthlyRevenue,
                'recent_payments' => $recentPayments,
                'expiring_subscriptions' => $expiringSubscriptions,
            ],
        ]);
    }

    public function revenueChart(Request $request)
    {
        $months = $request->get('months', 6);

        $revenue = Payment::select(
            DB::raw('YEAR(payment_date) as year'),
            DB::raw('MONTH(payment_date) as month'),
            DB::raw('SUM(amount) as total')
        )
            ->where('payment_date', '>=', now()->subMonths($months))
            ->groupBy('year', 'month')
            ->orderBy('year')
            ->orderBy('month')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $revenue,
        ]);
    }
}
```

### Router Setting Controller (app/Http/Controllers/Api/RouterSettingController.php)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RouterSetting;
use App\Services\MikrotikService;
use Illuminate\Http\Request;

class RouterSettingController extends Controller
{
    public function show()
    {
        $settings = RouterSetting::first();

        if ($settings) {
            $settings->makeVisible('password');
        }

        return response()->json([
            'success' => true,
            'data' => $settings,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'host' => 'required|string',
            'port' => 'required|integer|min:1|max:65535',
            'username' => 'required|string',
            'password' => 'required|string',
            'ssl' => 'boolean',
        ]);

        $settings = RouterSetting::first();

        if ($settings) {
            $settings->update($validated);
        } else {
            $settings = RouterSetting::create($validated);
        }

        return response()->json([
            'success' => true,
            'data' => $settings,
            'message' => 'Router settings saved successfully',
        ]);
    }

    public function test()
    {
        $mikrotik = new MikrotikService();
        $result = $mikrotik->testConnection();

        return response()->json($result, $result['success'] ? 200 : 500);
    }
}
```

---

## 7. API Routes

### Routes File (routes/api.php)

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
use App\Http\Controllers\Api\MidtransController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\RouterSettingController;

// Public routes
Route::post('/login', [AuthController::class, 'login']);

// Midtrans webhook (public, no auth)
Route::post('/midtrans/notification', [MidtransController::class, 'notification']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    // Dashboard
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/revenue-chart', [DashboardController::class, 'revenueChart']);

    // Customers CRUD
    Route::apiResource('customers', CustomerController::class);

    // Packages CRUD
    Route::apiResource('packages', PackageController::class);

    // Subscriptions CRUD
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('/subscriptions/{subscription}/suspend', [SubscriptionController::class, 'suspend']);
    Route::post('/subscriptions/{subscription}/activate', [SubscriptionController::class, 'activate']);

    // Invoices CRUD
    Route::apiResource('invoices', InvoiceController::class);

    // Payments
    Route::apiResource('payments', PaymentController::class)->only(['index', 'store', 'show']);

    // Router Settings
    Route::get('/router-settings', [RouterSettingController::class, 'show']);
    Route::post('/router-settings', [RouterSettingController::class, 'store']);
    Route::post('/router-settings/test', [RouterSettingController::class, 'test']);

    // MikroTik Operations
    Route::prefix('mikrotik')->group(function () {
        Route::get('/system', [MikrotikController::class, 'systemResource']);
        Route::get('/test', [MikrotikController::class, 'testConnection']);
        Route::get('/secrets', [MikrotikController::class, 'secrets']);
        Route::post('/secrets', [MikrotikController::class, 'createSecret']);
        Route::post('/secrets/enable', [MikrotikController::class, 'enableSecret']);
        Route::post('/secrets/disable', [MikrotikController::class, 'disableSecret']);
        Route::get('/active', [MikrotikController::class, 'activeConnections']);
        Route::post('/kick', [MikrotikController::class, 'kickUser']);
        Route::get('/profiles', [MikrotikController::class, 'profiles']);
        Route::get('/interfaces', [MikrotikController::class, 'interfaces']);
        Route::post('/interface-traffic', [MikrotikController::class, 'interfaceTraffic']);
        Route::get('/queues', [MikrotikController::class, 'queues']);
        Route::get('/dhcp-leases', [MikrotikController::class, 'dhcpLeases']);
        Route::get('/hotspot-users', [MikrotikController::class, 'hotspotUsers']);
    });

    // Midtrans
    Route::prefix('midtrans')->group(function () {
        Route::post('/snap-token', [MidtransController::class, 'createSnapToken']);
        Route::post('/check-status', [MidtransController::class, 'checkStatus']);
        Route::post('/cancel', [MidtransController::class, 'cancel']);
    });
});
```

---

## 8. MikroTik Integration

### How MikroTik Integration Works

1. **Connection**: Uses RouterOS API (port 8728) with legacy mode for ROS v6 compatibility
2. **Authentication**: Credentials stored in `router_settings` table
3. **Operations**: CRUD for PPPoE secrets, profiles, queues, etc.

### Integration Flow Diagram

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │  Laravel API    │      │   MikroTik      │
│   (React)       │─────▶│   (PHP)         │─────▶│   Router        │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
        │  1. Create             │  2. API Call           │
        │     Subscription       │     /ppp/secret/add    │
        │                        │                        │
        │                        │  3. Create PPPoE       │
        │                        │     User               │
        │                        │                        │
        │  4. Response           │  5. Success            │
        │◀────────────────────────◀────────────────────────│
```

### Billing Automation with MikroTik

```php
<?php
// app/Console/Commands/ProcessSubscriptions.php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\BillingLog;
use App\Services\MikrotikService;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Exception;

class ProcessSubscriptions extends Command
{
    protected $signature = 'subscriptions:process';
    protected $description = 'Process subscription renewals and overdue invoices';

    public function handle()
    {
        $this->info('Processing subscriptions...');

        // 1. Check expiring subscriptions (7 days warning)
        $this->processExpiringSubscriptions();

        // 2. Generate renewal invoices
        $this->generateRenewalInvoices();

        // 3. Process overdue invoices (suspend users)
        $this->processOverdueInvoices();

        $this->info('Done!');
    }

    protected function processExpiringSubscriptions()
    {
        $subscriptions = Subscription::where('status', 'active')
            ->whereBetween('end_date', [now()->addDays(5), now()->addDays(7)])
            ->get();

        foreach ($subscriptions as $subscription) {
            $daysLeft = now()->diffInDays($subscription->end_date);

            app(NotificationService::class)->sendExpiryWarning($subscription, $daysLeft);

            BillingLog::create([
                'subscription_id' => $subscription->id,
                'action' => 'expiry_warning',
                'message' => "Expiry warning sent ({$daysLeft} days left)",
            ]);

            $this->info("Expiry warning sent for {$subscription->mikrotik_username}");
        }
    }

    protected function generateRenewalInvoices()
    {
        // Find subscriptions expiring in 3 days without unpaid invoice
        $subscriptions = Subscription::where('status', 'active')
            ->where('auto_renew', true)
            ->whereBetween('end_date', [now(), now()->addDays(3)])
            ->whereDoesntHave('invoices', function ($query) {
                $query->where('status', 'unpaid');
            })
            ->get();

        foreach ($subscriptions as $subscription) {
            $invoice = Invoice::create([
                'subscription_id' => $subscription->id,
                'amount' => $subscription->package->price,
                'due_date' => $subscription->end_date,
                'status' => 'unpaid',
                'notes' => 'Auto-generated renewal invoice',
            ]);

            BillingLog::create([
                'subscription_id' => $subscription->id,
                'invoice_id' => $invoice->id,
                'action' => 'invoice_generated',
                'message' => 'Renewal invoice auto-generated',
            ]);

            $this->info("Invoice generated for {$subscription->mikrotik_username}");
        }
    }

    protected function processOverdueInvoices()
    {
        // Find overdue invoices (3 days grace period)
        $invoices = Invoice::where('status', 'unpaid')
            ->where('due_date', '<', now()->subDays(3))
            ->whereHas('subscription', function ($query) {
                $query->where('status', 'active');
            })
            ->get();

        $mikrotik = new MikrotikService();

        foreach ($invoices as $invoice) {
            $subscription = $invoice->subscription;

            try {
                // Disable MikroTik user
                $mikrotik->disablePPPoESecret($subscription->mikrotik_username);

                // Update subscription status
                $subscription->update(['status' => 'suspended']);

                // Update invoice status
                $invoice->update(['status' => 'overdue']);

                // Send notification
                app(NotificationService::class)->sendSuspensionNotice($subscription);

                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'invoice_id' => $invoice->id,
                    'action' => 'user_suspended',
                    'message' => "User suspended due to overdue payment",
                ]);

                $this->info("Suspended {$subscription->mikrotik_username}");
            } catch (Exception $e) {
                BillingLog::create([
                    'subscription_id' => $subscription->id,
                    'action' => 'suspension_error',
                    'message' => $e->getMessage(),
                ]);

                $this->error("Failed to suspend {$subscription->mikrotik_username}: {$e->getMessage()}");
            }
        }
    }
}
```

### Schedule Configuration (app/Console/Kernel.php)

```php
<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        // Run subscription processing daily at 1 AM
        $schedule->command('subscriptions:process')
            ->dailyAt('01:00')
            ->withoutOverlapping();
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
        require base_path('routes/console.php');
    }
}
```

---

## 9. Midtrans Payment Integration

### Configuration (config/services.php)

```php
<?php

return [
    // ... other services

    'midtrans' => [
        'server_key' => env('MIDTRANS_SERVER_KEY'),
        'client_key' => env('MIDTRANS_CLIENT_KEY'),
        'is_production' => env('MIDTRANS_IS_PRODUCTION', false),
        'snap_url' => env('MIDTRANS_SNAP_URL', 'https://app.sandbox.midtrans.com/snap/snap.js'),
        'finish_url' => env('FRONTEND_URL') . '/payments/finish',
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
    ],
];
```

### Payment Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Customer  │     │   Frontend  │     │   Laravel   │     │   Midtrans  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  1. Click Pay     │                   │                   │
       │──────────────────▶│                   │                   │
       │                   │  2. Request       │                   │
       │                   │     Snap Token    │                   │
       │                   │──────────────────▶│                   │
       │                   │                   │  3. Create        │
       │                   │                   │     Transaction   │
       │                   │                   │──────────────────▶│
       │                   │                   │                   │
       │                   │                   │  4. Snap Token    │
       │                   │                   │◀──────────────────│
       │                   │  5. Token         │                   │
       │                   │◀──────────────────│                   │
       │  6. Show Snap     │                   │                   │
       │     Popup         │                   │                   │
       │◀──────────────────│                   │                   │
       │                   │                   │                   │
       │  7. Complete      │                   │                   │
       │     Payment       │                   │                   │
       │──────────────────────────────────────────────────────────▶│
       │                   │                   │                   │
       │                   │                   │  8. Webhook       │
       │                   │                   │◀──────────────────│
       │                   │                   │                   │
       │                   │                   │  9. Update        │
       │                   │                   │     Invoice       │
       │                   │                   │     Enable User   │
       │                   │                   │                   │
       │  10. Success      │                   │                   │
       │◀──────────────────│                   │                   │
```

---

## 10. Frontend Integration

### Environment Variables (.env for Frontend)

```env
VITE_API_URL=http://localhost:8000/api
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
VITE_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js
```

### API Client Usage (src/lib/api.ts)

The frontend uses the `api` client to communicate with Laravel:

```typescript
// Login
const response = await api.login(email, password);
if (response.success) {
  api.setToken(response.data.token);
}

// Get customers
const customers = await api.getCustomers();

// Create subscription
const subscription = await api.createSubscription({
  customer_id: customerId,
  package_id: packageId,
  mikrotik_username: username,
  mikrotik_password: password,
  start_date: startDate,
  end_date: endDate,
});

// Create Snap Token for payment
const snapResponse = await api.createSnapToken({
  invoice_id: invoiceId,
  customer_name: customerName,
  customer_email: customerEmail,
});

if (snapResponse.success) {
  window.snap.pay(snapResponse.data.snap_token, {
    onSuccess: (result) => console.log('Payment success', result),
    onPending: (result) => console.log('Payment pending', result),
    onError: (result) => console.log('Payment error', result),
  });
}
```

---

## 11. Testing & Deployment

### Local Testing (XAMPP)

```bash
# Start XAMPP services
# - Apache
# - MySQL

# Create database
mysql -u root -e "CREATE DATABASE isp_billing"

# Install dependencies
composer install

# Run migrations
php artisan migrate

# Seed database
php artisan db:seed

# Start Laravel server
php artisan serve

# Test API endpoints
curl http://localhost:8000/api/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@isp.local","password":"password"}'
```

### Production Deployment

#### 1. Server Setup

```bash
# Install requirements
sudo apt update
sudo apt install php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml php8.2-curl nginx mysql-server supervisor

# Clone project
cd /var/www
git clone your-repo.git isp-billing
cd isp-billing

# Install dependencies
composer install --optimize-autoloader --no-dev

# Set permissions
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

# Configure environment
cp .env.example .env
php artisan key:generate

# Run migrations
php artisan migrate --force
```

#### 2. Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourisp.com;
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
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

#### 3. Supervisor Configuration

```ini
[program:isp-billing-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/isp-billing/artisan queue:work --sleep=3 --tries=3
autostart=true
autorestart=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/isp-billing/storage/logs/worker.log
```

#### 4. Crontab

```bash
# Edit crontab
crontab -e

# Add Laravel scheduler
* * * * * cd /var/www/isp-billing && php artisan schedule:run >> /dev/null 2>&1
```

#### 5. Midtrans Webhook

Configure in Midtrans Dashboard:
- URL: `https://api.yourisp.com/api/midtrans/notification`
- Method: POST

### Testing Checklist

- [ ] Login/Logout works
- [ ] CRUD operations for all entities
- [ ] MikroTik connection test
- [ ] PPPoE user creation/deletion
- [ ] Invoice generation
- [ ] Midtrans payment flow
- [ ] Webhook processing
- [ ] User suspension on overdue
- [ ] User reactivation on payment
- [ ] Scheduler runs correctly
- [ ] Telegram notifications

---

## Quick Reference

### API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/login | Login |
| POST | /api/logout | Logout |
| GET | /api/dashboard/stats | Dashboard statistics |
| GET | /api/customers | List customers |
| POST | /api/customers | Create customer |
| GET | /api/packages | List packages |
| POST | /api/subscriptions | Create subscription |
| POST | /api/subscriptions/{id}/suspend | Suspend user |
| POST | /api/subscriptions/{id}/activate | Activate user |
| GET | /api/invoices | List invoices |
| POST | /api/payments | Record payment |
| GET | /api/mikrotik/system | Get router info |
| GET | /api/mikrotik/active | Active connections |
| POST | /api/midtrans/snap-token | Get payment token |

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Author**: ISP Billing System Team
