# ISP Billing System - Complete Setup Guide

Panduan lengkap untuk setup dan integrasi Backend Laravel dengan Frontend React.

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Architecture Overview](#architecture-overview)
3. [Backend Setup (Laravel)](#backend-setup-laravel)
4. [Frontend Setup (React)](#frontend-setup-react)
5. [Database Configuration](#database-configuration)
6. [MikroTik Integration](#mikrotik-integration)
7. [API Reference](#api-reference)
8. [Environment Variables](#environment-variables)
9. [Testing & Debugging](#testing--debugging)
10. [Production Deployment](#production-deployment)
11. [Troubleshooting](#troubleshooting)

---

## 🖥️ System Requirements

### Backend (Laravel)
- PHP 8.1 atau lebih tinggi
- Composer 2.x
- MySQL 8.0 / MariaDB 10.6+
- Apache/Nginx web server
- XAMPP (untuk development lokal)

### Frontend (React)
- Node.js 18+ atau Bun
- npm/yarn/bun package manager

### MikroTik
- RouterOS v6.x (Legacy API mode)
- API service enabled (port 8728 default)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    React + Vite + TypeScript                    │
│                     Horizon UI Design                            │
├─────────────────────────────────────────────────────────────────┤
│                          API Client                              │
│                      src/lib/api.ts                              │
│                    VITE_API_URL env var                          │
├─────────────────────────────────────────────────────────────────┤
│                           ↕ HTTP                                 │
├─────────────────────────────────────────────────────────────────┤
│                         BACKEND                                  │
│                    Laravel 11/12 API                             │
│                   http://localhost:8000                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   MySQL DB   │  │   MikroTik   │  │   Midtrans Payment   │  │
│  │  (Billing)   │  │   RouterOS   │  │      Gateway         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Backend Setup (Laravel)

### Step 1: Install XAMPP

1. Download XAMPP dari https://www.apachefriends.org/
2. Install dengan komponen: Apache, MySQL, PHP
3. Start Apache dan MySQL dari XAMPP Control Panel

### Step 2: Create Laravel Project

```bash
# Buka terminal di folder htdocs
cd C:\xampp\htdocs

# Create Laravel project
composer create-project laravel/laravel isp-billing-api

# Masuk ke folder project
cd isp-billing-api
```

### Step 3: Configure Environment

Edit file `.env`:

```env
APP_NAME="ISP Billing API"
APP_ENV=local
APP_KEY=base64:your-key-here
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database Configuration
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=root
DB_PASSWORD=

# MikroTik Configuration
MIKROTIK_HOST=192.168.88.1
MIKROTIK_USER=admin
MIKROTIK_PASS=your_password
MIKROTIK_PORT=8728

# Midtrans Configuration
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_IS_PRODUCTION=false

# CORS - Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Step 4: Create Database

1. Buka phpMyAdmin: http://localhost/phpmyadmin
2. Create database baru: `isp_billing`
3. Atau via terminal:

```bash
mysql -u root -e "CREATE DATABASE isp_billing"
```

### Step 5: Install Dependencies

```bash
# MikroTik API Library (ROS v6 compatible)
composer require evilfreelancer/routeros-api-php

# Midtrans Payment
composer require midtrans/midtrans-php

# Laravel Sanctum (Authentication)
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
```

### Step 6: Configure CORS

Edit `config/cors.php`:

```php
<?php

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

### Step 7: Create Database Migrations

```bash
# Create migrations
php artisan make:migration create_customers_table
php artisan make:migration create_packages_table
php artisan make:migration create_subscriptions_table
php artisan make:migration create_invoices_table
php artisan make:migration create_payments_table
php artisan make:migration create_router_settings_table
```

### Step 8: Example Migration (customers)

```php
// database/migrations/xxxx_create_customers_table.php
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
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
```

### Step 9: Run Migrations

```bash
php artisan migrate
```

### Step 10: Create MikroTik Service

```php
// app/Services/MikrotikService.php
<?php

namespace App\Services;

use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class MikrotikService
{
    protected $client;

    public function __construct()
    {
        $config = new Config([
            'host' => config('mikrotik.host'),
            'user' => config('mikrotik.user'),
            'pass' => config('mikrotik.pass'),
            'port' => (int) config('mikrotik.port', 8728),
            'legacy' => true, // ROS v6 compatibility
        ]);

        $this->client = new Client($config);
    }

    public function getSystemResources(): array
    {
        $query = new Query('/system/resource/print');
        return $this->client->query($query)->read();
    }

    public function getPPPoEActiveConnections(): array
    {
        $query = new Query('/ppp/active/print');
        return $this->client->query($query)->read();
    }

    public function getHotspotActiveUsers(): array
    {
        $query = new Query('/ip/hotspot/active/print');
        return $this->client->query($query)->read();
    }

    public function createPPPoESecret(array $data): array
    {
        $query = (new Query('/ppp/secret/add'))
            ->equal('name', $data['username'])
            ->equal('password', $data['password'])
            ->equal('service', 'pppoe')
            ->equal('profile', $data['profile'] ?? 'default');

        return $this->client->query($query)->read();
    }

    public function disablePPPoESecret(string $username): array
    {
        // Find the secret first
        $findQuery = (new Query('/ppp/secret/print'))
            ->where('name', $username);
        $secrets = $this->client->query($findQuery)->read();

        if (empty($secrets)) {
            throw new \Exception("PPPoE secret not found: {$username}");
        }

        $secretId = $secrets[0]['.id'];

        // Disable it
        $disableQuery = (new Query('/ppp/secret/set'))
            ->equal('.id', $secretId)
            ->equal('disabled', 'yes');

        return $this->client->query($disableQuery)->read();
    }

    public function enablePPPoESecret(string $username): array
    {
        $findQuery = (new Query('/ppp/secret/print'))
            ->where('name', $username);
        $secrets = $this->client->query($findQuery)->read();

        if (empty($secrets)) {
            throw new \Exception("PPPoE secret not found: {$username}");
        }

        $secretId = $secrets[0]['.id'];

        $enableQuery = (new Query('/ppp/secret/set'))
            ->equal('.id', $secretId)
            ->equal('disabled', 'no');

        return $this->client->query($enableQuery)->read();
    }

    public function testConnection(): array
    {
        try {
            $resources = $this->getSystemResources();
            return [
                'success' => true,
                'message' => 'Connected to MikroTik',
                'data' => $resources[0] ?? []
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
}
```

### Step 11: Create API Controllers

```php
// app/Http/Controllers/Api/MikrotikController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MikrotikService;
use Illuminate\Http\JsonResponse;

class MikrotikController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;
    }

    public function testConnection(): JsonResponse
    {
        $result = $this->mikrotik->testConnection();
        return response()->json($result);
    }

    public function getSystemResources(): JsonResponse
    {
        try {
            $resources = $this->mikrotik->getSystemResources();
            return response()->json([
                'success' => true,
                'data' => $resources[0] ?? []
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function getOnlineUsers(): JsonResponse
    {
        try {
            $pppoe = $this->mikrotik->getPPPoEActiveConnections();
            $hotspot = $this->mikrotik->getHotspotActiveUsers();

            $users = [];

            foreach ($pppoe as $user) {
                $users[] = [
                    'type' => 'pppoe',
                    'name' => $user['name'] ?? '',
                    'address' => $user['address'] ?? '',
                    'uptime' => $user['uptime'] ?? '',
                    'caller_id' => $user['caller-id'] ?? '',
                ];
            }

            foreach ($hotspot as $user) {
                $users[] = [
                    'type' => 'hotspot',
                    'name' => $user['user'] ?? '',
                    'address' => $user['address'] ?? '',
                    'uptime' => $user['uptime'] ?? '',
                    'mac' => $user['mac-address'] ?? '',
                ];
            }

            return response()->json([
                'success' => true,
                'data' => $users
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }
}
```

---

## 📦 Complete CRUD Implementation

### Eloquent Models

#### Customer Model
```php
// app/Models/Customer.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Customer extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'address',
        'status',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function activeSubscription(): HasOne
    {
        return $this->hasOne(Subscription::class)
            ->where('status', 'active')
            ->latest();
    }

    public function invoices(): HasMany
    {
        return $this->hasManyThrough(Invoice::class, Subscription::class);
    }
}
```

#### Package Model
```php
// app/Models/Package.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'price',
        'bandwidth',
        'burst',
        'priority',
        'type',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'priority' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
```

#### Subscription Model
```php
// app/Models/Subscription.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    use HasUuids;

    protected $fillable = [
        'customer_id',
        'package_id',
        'start_date',
        'end_date',
        'mikrotik_username',
        'mikrotik_password',
        'auto_renew',
        'status',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'auto_renew' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
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

    public function latestInvoice(): HasOne
    {
        return $this->hasOne(Invoice::class)->latest();
    }
}
```

#### Invoice Model
```php
// app/Models/Invoice.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    use HasUuids;

    protected $fillable = [
        'subscription_id',
        'amount',
        'due_date',
        'status',
        'payment_reference',
        'payment_url',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'due_date' => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function customer()
    {
        return $this->subscription?->customer;
    }
}
```

#### Payment Model
```php
// app/Models/Payment.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use HasUuids;

    protected $fillable = [
        'invoice_id',
        'amount',
        'method',
        'payment_date',
        'transaction_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
```

---

### Form Request Validation Classes

#### CustomerRequest
```php
// app/Http/Requests/CustomerRequest.php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:500',
            'status' => 'required|in:active,inactive,suspended',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama customer wajib diisi',
            'name.max' => 'Nama maksimal 100 karakter',
            'email.email' => 'Format email tidak valid',
            'status.in' => 'Status harus active, inactive, atau suspended',
        ];
    }
}
```

#### PackageRequest
```php
// app/Http/Requests/PackageRequest.php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PackageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'price' => 'required|numeric|min:0',
            'bandwidth' => 'required|string|max:50',
            'burst' => 'nullable|string|max:50',
            'priority' => 'nullable|integer|min:1|max:8',
            'type' => 'required|in:pppoe,hotspot',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama paket wajib diisi',
            'price.required' => 'Harga wajib diisi',
            'price.numeric' => 'Harga harus berupa angka',
            'bandwidth.required' => 'Bandwidth wajib diisi',
            'type.in' => 'Tipe harus pppoe atau hotspot',
        ];
    }
}
```

#### SubscriptionRequest
```php
// app/Http/Requests/SubscriptionRequest.php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id' => 'required|exists:customers,id',
            'package_id' => 'required|exists:packages,id',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after:start_date',
            'mikrotik_username' => 'required|string|min:3|max:50',
            'mikrotik_password' => 'required|string|min:6|max:100',
            'auto_renew' => 'boolean',
            'status' => 'nullable|in:active,suspended,expired',
        ];
    }

    public function messages(): array
    {
        return [
            'customer_id.required' => 'Customer wajib dipilih',
            'customer_id.exists' => 'Customer tidak ditemukan',
            'package_id.required' => 'Paket wajib dipilih',
            'package_id.exists' => 'Paket tidak ditemukan',
            'end_date.after' => 'Tanggal akhir harus setelah tanggal mulai',
            'mikrotik_username.min' => 'Username minimal 3 karakter',
            'mikrotik_password.min' => 'Password minimal 6 karakter',
        ];
    }
}
```

#### InvoiceRequest
```php
// app/Http/Requests/InvoiceRequest.php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class InvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'subscription_id' => 'required|exists:subscriptions,id',
            'amount' => 'required|numeric|min:0',
            'due_date' => 'required|date',
            'status' => 'nullable|in:unpaid,paid,overdue',
            'payment_reference' => 'nullable|string|max:100',
            'payment_url' => 'nullable|url',
            'notes' => 'nullable|string|max:500',
        ];
    }
}
```

#### PaymentRequest
```php
// app/Http/Requests/PaymentRequest.php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'invoice_id' => 'required|exists:invoices,id',
            'amount' => 'required|numeric|min:0',
            'method' => 'required|in:cash,bank_transfer,card,mobile_money,midtrans',
            'payment_date' => 'nullable|date',
            'transaction_id' => 'nullable|string|max:100',
        ];
    }
}
```

---

### CRUD Controllers

#### CustomerController
```php
// app/Http/Controllers/Api/CustomerController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerRequest;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query()
            ->withCount(['subscriptions', 'subscriptions as active_subscriptions_count' => function ($q) {
                $q->where('status', 'active');
            }]);

        // Search
        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // Filter by status
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortDir = $request->get('sort_dir', 'desc');
        $query->orderBy($sortBy, $sortDir);

        // Paginate
        $perPage = $request->get('per_page', 15);
        $customers = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $customers->items(),
            'pagination' => [
                'current_page' => $customers->currentPage(),
                'last_page' => $customers->lastPage(),
                'per_page' => $customers->perPage(),
                'total' => $customers->total(),
            ],
        ]);
    }

    public function store(CustomerRequest $request): JsonResponse
    {
        $customer = Customer::create($request->validated());

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Customer berhasil dibuat',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $customer = Customer::with(['subscriptions.package', 'subscriptions.invoices'])
            ->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $customer,
        ]);
    }

    public function update(CustomerRequest $request, string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $customer->update($request->validated());

        return response()->json([
            'success' => true,
            'data' => $customer,
            'message' => 'Customer berhasil diupdate',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        // Check for active subscriptions
        if ($customer->subscriptions()->where('status', 'active')->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus customer dengan subscription aktif',
            ], 422);
        }

        $customer->delete();

        return response()->json([
            'success' => true,
            'message' => 'Customer berhasil dihapus',
        ]);
    }
}
```

#### PackageController
```php
// app/Http/Controllers/Api/PackageController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PackageRequest;
use App\Models\Package;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PackageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Package::query()
            ->withCount('subscriptions');

        // Filter by type
        if ($type = $request->get('type')) {
            $query->where('type', $type);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'price');
        $sortDir = $request->get('sort_dir', 'asc');
        $query->orderBy($sortBy, $sortDir);

        $packages = $query->get();

        return response()->json([
            'success' => true,
            'data' => $packages,
        ]);
    }

    public function store(PackageRequest $request): JsonResponse
    {
        $package = Package::create($request->validated());

        return response()->json([
            'success' => true,
            'data' => $package,
            'message' => 'Paket berhasil dibuat',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $package = Package::withCount('subscriptions')->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $package,
        ]);
    }

    public function update(PackageRequest $request, string $id): JsonResponse
    {
        $package = Package::findOrFail($id);
        $package->update($request->validated());

        return response()->json([
            'success' => true,
            'data' => $package,
            'message' => 'Paket berhasil diupdate',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $package = Package::findOrFail($id);

        // Check for active subscriptions
        if ($package->subscriptions()->where('status', 'active')->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus paket dengan subscription aktif',
            ], 422);
        }

        $package->delete();

        return response()->json([
            'success' => true,
            'message' => 'Paket berhasil dihapus',
        ]);
    }
}
```

#### SubscriptionController
```php
// app/Http/Controllers/Api/SubscriptionController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SubscriptionRequest;
use App\Models\Invoice;
use App\Models\Package;
use App\Models\Subscription;
use App\Services\MikrotikService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;
    }

    public function index(Request $request): JsonResponse
    {
        $query = Subscription::with(['customer', 'package'])
            ->withCount('invoices');

        // Filter by status
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Filter by customer
        if ($customerId = $request->get('customer_id')) {
            $query->where('customer_id', $customerId);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortDir = $request->get('sort_dir', 'desc');
        $query->orderBy($sortBy, $sortDir);

        // Paginate
        $perPage = $request->get('per_page', 15);
        $subscriptions = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $subscriptions->items(),
            'pagination' => [
                'current_page' => $subscriptions->currentPage(),
                'last_page' => $subscriptions->lastPage(),
                'per_page' => $subscriptions->perPage(),
                'total' => $subscriptions->total(),
            ],
        ]);
    }

    public function store(SubscriptionRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['status'] = $data['status'] ?? 'active';

        // Create subscription
        $subscription = Subscription::create($data);

        // Get package for MikroTik profile
        $package = Package::findOrFail($data['package_id']);

        // Create MikroTik user
        try {
            if ($package->type === 'pppoe') {
                $this->mikrotik->createPPPoESecret([
                    'username' => $data['mikrotik_username'],
                    'password' => $data['mikrotik_password'],
                    'profile' => $package->name,
                ]);
            } else {
                $this->mikrotik->createHotspotUser([
                    'username' => $data['mikrotik_username'],
                    'password' => $data['mikrotik_password'],
                    'profile' => $package->name,
                ]);
            }

            // Create simple queue
            $this->mikrotik->createQueue([
                'name' => $data['mikrotik_username'],
                'target' => $data['mikrotik_username'],
                'max-limit' => $package->bandwidth,
                'burst-limit' => $package->burst ?? $package->bandwidth,
                'priority' => $package->priority ?? 8,
            ]);
        } catch (\Exception $e) {
            // Log error but continue (MikroTik might not be connected)
            \Log::warning('MikroTik sync failed: ' . $e->getMessage());
        }

        // Create first invoice
        Invoice::create([
            'subscription_id' => $subscription->id,
            'amount' => $package->price,
            'due_date' => now()->addDays(7),
            'status' => 'unpaid',
        ]);

        return response()->json([
            'success' => true,
            'data' => $subscription->load(['customer', 'package', 'invoices']),
            'message' => 'Subscription berhasil dibuat',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $subscription = Subscription::with([
            'customer',
            'package',
            'invoices.payments',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $subscription,
        ]);
    }

    public function update(SubscriptionRequest $request, string $id): JsonResponse
    {
        $subscription = Subscription::findOrFail($id);
        $oldStatus = $subscription->status;
        $data = $request->validated();

        $subscription->update($data);

        // Handle status change for MikroTik
        $newStatus = $data['status'] ?? $oldStatus;

        if ($oldStatus !== $newStatus) {
            try {
                $package = $subscription->package;

                if ($newStatus === 'suspended') {
                    // Disable MikroTik user
                    if ($package->type === 'pppoe') {
                        $this->mikrotik->disablePPPoESecret($subscription->mikrotik_username);
                    } else {
                        $this->mikrotik->disableHotspotUser($subscription->mikrotik_username);
                    }
                } elseif ($newStatus === 'active' && $oldStatus === 'suspended') {
                    // Enable MikroTik user
                    if ($package->type === 'pppoe') {
                        $this->mikrotik->enablePPPoESecret($subscription->mikrotik_username);
                    } else {
                        $this->mikrotik->enableHotspotUser($subscription->mikrotik_username);
                    }
                }
            } catch (\Exception $e) {
                \Log::warning('MikroTik status sync failed: ' . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'data' => $subscription->load(['customer', 'package']),
            'message' => 'Subscription berhasil diupdate',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $subscription = Subscription::findOrFail($id);

        // Remove MikroTik user
        try {
            $package = $subscription->package;

            if ($package->type === 'pppoe') {
                $this->mikrotik->deletePPPoESecret($subscription->mikrotik_username);
            } else {
                $this->mikrotik->deleteHotspotUser($subscription->mikrotik_username);
            }

            // Remove queue
            $this->mikrotik->deleteQueue($subscription->mikrotik_username);
        } catch (\Exception $e) {
            \Log::warning('MikroTik delete failed: ' . $e->getMessage());
        }

        $subscription->delete();

        return response()->json([
            'success' => true,
            'message' => 'Subscription berhasil dihapus',
        ]);
    }
}
```

#### InvoiceController
```php
// app/Http/Controllers/Api/InvoiceController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\InvoiceRequest;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with(['subscription.customer', 'subscription.package', 'payments']);

        // Update overdue status
        Invoice::where('status', 'unpaid')
            ->where('due_date', '<', now())
            ->update(['status' => 'overdue']);

        // Filter by status
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Filter by subscription
        if ($subscriptionId = $request->get('subscription_id')) {
            $query->where('subscription_id', $subscriptionId);
        }

        // Filter by date range
        if ($from = $request->get('from_date')) {
            $query->where('due_date', '>=', $from);
        }
        if ($to = $request->get('to_date')) {
            $query->where('due_date', '<=', $to);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'due_date');
        $sortDir = $request->get('sort_dir', 'desc');
        $query->orderBy($sortBy, $sortDir);

        // Paginate
        $perPage = $request->get('per_page', 15);
        $invoices = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $invoices->items(),
            'pagination' => [
                'current_page' => $invoices->currentPage(),
                'last_page' => $invoices->lastPage(),
                'per_page' => $invoices->perPage(),
                'total' => $invoices->total(),
            ],
        ]);
    }

    public function store(InvoiceRequest $request): JsonResponse
    {
        $invoice = Invoice::create($request->validated());

        return response()->json([
            'success' => true,
            'data' => $invoice->load(['subscription.customer', 'subscription.package']),
            'message' => 'Invoice berhasil dibuat',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $invoice = Invoice::with([
            'subscription.customer',
            'subscription.package',
            'payments',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $invoice,
        ]);
    }

    public function update(InvoiceRequest $request, string $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $invoice->update($request->validated());

        return response()->json([
            'success' => true,
            'data' => $invoice->load(['subscription.customer']),
            'message' => 'Invoice berhasil diupdate',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);

        if ($invoice->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus invoice yang sudah dibayar',
            ], 422);
        }

        $invoice->delete();

        return response()->json([
            'success' => true,
            'message' => 'Invoice berhasil dihapus',
        ]);
    }

    public function markPaid(string $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $invoice->update(['status' => 'paid']);

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => 'Invoice ditandai sebagai lunas',
        ]);
    }

    // Public endpoint for customer payment portal
    public function publicShow(string $id): JsonResponse
    {
        $invoice = Invoice::with([
            'subscription.customer:id,name,email,phone',
            'subscription.package:id,name,price,bandwidth',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $invoice->id,
                'amount' => $invoice->amount,
                'due_date' => $invoice->due_date,
                'status' => $invoice->status,
                'customer_name' => $invoice->subscription->customer->name,
                'customer_email' => $invoice->subscription->customer->email,
                'package_name' => $invoice->subscription->package->name,
                'package_bandwidth' => $invoice->subscription->package->bandwidth,
            ],
        ]);
    }
}
```

#### PaymentController
```php
// app/Http/Controllers/Api/PaymentController.php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PaymentRequest;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Subscription;
use App\Services\MikrotikService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Midtrans\Config;
use Midtrans\Snap;
use Midtrans\Notification;

class PaymentController extends Controller
{
    protected MikrotikService $mikrotik;

    public function __construct(MikrotikService $mikrotik)
    {
        $this->mikrotik = $mikrotik;

        // Configure Midtrans
        Config::$serverKey = config('services.midtrans.server_key');
        Config::$isProduction = config('services.midtrans.is_production', false);
        Config::$isSanitized = true;
        Config::$is3ds = true;
    }

    public function index(Request $request): JsonResponse
    {
        $query = Payment::with(['invoice.subscription.customer']);

        // Filter by invoice
        if ($invoiceId = $request->get('invoice_id')) {
            $query->where('invoice_id', $invoiceId);
        }

        // Filter by method
        if ($method = $request->get('method')) {
            $query->where('method', $method);
        }

        // Filter by date range
        if ($from = $request->get('from_date')) {
            $query->where('payment_date', '>=', $from);
        }
        if ($to = $request->get('to_date')) {
            $query->where('payment_date', '<=', $to);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'payment_date');
        $sortDir = $request->get('sort_dir', 'desc');
        $query->orderBy($sortBy, $sortDir);

        // Paginate
        $perPage = $request->get('per_page', 15);
        $payments = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $payments->items(),
            'pagination' => [
                'current_page' => $payments->currentPage(),
                'last_page' => $payments->lastPage(),
                'per_page' => $payments->perPage(),
                'total' => $payments->total(),
            ],
        ]);
    }

    public function store(PaymentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['payment_date'] = $data['payment_date'] ?? now();

        $payment = Payment::create($data);

        // Update invoice status
        $invoice = Invoice::findOrFail($data['invoice_id']);
        $invoice->update(['status' => 'paid']);

        // Re-enable subscription if suspended
        $subscription = $invoice->subscription;
        if ($subscription->status === 'suspended') {
            $subscription->update(['status' => 'active']);

            // Enable MikroTik user
            try {
                $package = $subscription->package;
                if ($package->type === 'pppoe') {
                    $this->mikrotik->enablePPPoESecret($subscription->mikrotik_username);
                } else {
                    $this->mikrotik->enableHotspotUser($subscription->mikrotik_username);
                }
            } catch (\Exception $e) {
                \Log::warning('MikroTik enable failed: ' . $e->getMessage());
            }
        }

        // Generate next invoice if auto_renew
        if ($subscription->auto_renew) {
            // Extend subscription
            $newEndDate = $subscription->end_date->addMonth();
            $subscription->update(['end_date' => $newEndDate]);

            // Create next invoice
            Invoice::create([
                'subscription_id' => $subscription->id,
                'amount' => $subscription->package->price,
                'due_date' => $newEndDate->subDays(7),
                'status' => 'unpaid',
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $payment->load('invoice'),
            'message' => 'Pembayaran berhasil dicatat',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $payment = Payment::with([
            'invoice.subscription.customer',
            'invoice.subscription.package',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $payment,
        ]);
    }

    // Create Midtrans Snap token
    public function createSnapToken(Request $request): JsonResponse
    {
        $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
        ]);

        $invoice = Invoice::with(['subscription.customer', 'subscription.package'])
            ->findOrFail($request->invoice_id);

        $params = [
            'transaction_details' => [
                'order_id' => 'INV-' . $invoice->id . '-' . time(),
                'gross_amount' => (int) $invoice->amount,
            ],
            'customer_details' => [
                'first_name' => $invoice->subscription->customer->name,
                'email' => $invoice->subscription->customer->email ?? 'customer@example.com',
                'phone' => $invoice->subscription->customer->phone ?? '',
            ],
            'item_details' => [
                [
                    'id' => $invoice->subscription->package->id,
                    'price' => (int) $invoice->amount,
                    'quantity' => 1,
                    'name' => $invoice->subscription->package->name . ' - ' .
                              $invoice->subscription->package->bandwidth,
                ],
            ],
        ];

        try {
            $snapToken = Snap::getSnapToken($params);

            // Save snap token reference
            $invoice->update([
                'payment_reference' => $params['transaction_details']['order_id'],
            ]);

            return response()->json([
                'success' => true,
                'data' => [
                    'snap_token' => $snapToken,
                    'order_id' => $params['transaction_details']['order_id'],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal membuat token pembayaran: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Handle Midtrans webhook
    public function handleWebhook(Request $request): JsonResponse
    {
        try {
            $notification = new Notification();

            $transactionStatus = $notification->transaction_status;
            $orderId = $notification->order_id;
            $fraudStatus = $notification->fraud_status;

            // Extract invoice ID from order_id (format: INV-{uuid}-{timestamp})
            $parts = explode('-', $orderId);
            if (count($parts) < 2) {
                return response()->json(['message' => 'Invalid order ID'], 400);
            }

            // Reconstruct UUID (parts 1-5)
            $invoiceId = implode('-', array_slice($parts, 1, 5));

            $invoice = Invoice::find($invoiceId);
            if (!$invoice) {
                return response()->json(['message' => 'Invoice not found'], 404);
            }

            // Handle transaction status
            if ($transactionStatus == 'capture' || $transactionStatus == 'settlement') {
                if ($fraudStatus == 'accept' || $transactionStatus == 'settlement') {
                    // Payment success
                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'amount' => $invoice->amount,
                        'method' => 'midtrans',
                        'payment_date' => now(),
                        'transaction_id' => $notification->transaction_id,
                    ]);

                    $invoice->update(['status' => 'paid']);

                    // Re-enable subscription if suspended
                    $subscription = $invoice->subscription;
                    if ($subscription->status === 'suspended') {
                        $subscription->update(['status' => 'active']);

                        try {
                            $package = $subscription->package;
                            if ($package->type === 'pppoe') {
                                $this->mikrotik->enablePPPoESecret($subscription->mikrotik_username);
                            } else {
                                $this->mikrotik->enableHotspotUser($subscription->mikrotik_username);
                            }
                        } catch (\Exception $e) {
                            \Log::warning('MikroTik webhook enable failed: ' . $e->getMessage());
                        }
                    }

                    // Generate next invoice if auto_renew
                    if ($subscription->auto_renew) {
                        $newEndDate = $subscription->end_date->addMonth();
                        $subscription->update(['end_date' => $newEndDate]);

                        Invoice::create([
                            'subscription_id' => $subscription->id,
                            'amount' => $subscription->package->price,
                            'due_date' => $newEndDate->subDays(7),
                            'status' => 'unpaid',
                        ]);
                    }
                }
            } elseif ($transactionStatus == 'pending') {
                // Payment pending - do nothing
            } elseif (in_array($transactionStatus, ['deny', 'expire', 'cancel'])) {
                // Payment failed
                $invoice->update(['status' => 'unpaid']);
            }

            return response()->json(['message' => 'Webhook processed']);
        } catch (\Exception $e) {
            \Log::error('Midtrans webhook error: ' . $e->getMessage());
            return response()->json(['message' => 'Webhook error'], 500);
        }
    }
}
```

---

### Step 12: Define API Routes

```php
// routes/api.php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MikrotikController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\PackageController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\RouterSettingsController;
use App\Http\Controllers\Api\AuthController;

// Health check
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'message' => 'ISP Billing API is running',
        'timestamp' => now()->toIso8601String()
    ]);
});

// Auth routes
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('/user', [AuthController::class, 'user'])->middleware('auth:sanctum');
});

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // CRUD Resources
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('packages', PackageController::class);
    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::apiResource('invoices', InvoiceController::class);
    Route::apiResource('payments', PaymentController::class);

    // Invoice additional routes
    Route::post('/invoices/{id}/mark-paid', [InvoiceController::class, 'markPaid']);

    // Router Settings
    Route::get('/router-settings', [RouterSettingsController::class, 'index']);
    Route::post('/router-settings', [RouterSettingsController::class, 'store']);
    Route::get('/router-settings/test', [RouterSettingsController::class, 'testConnection']);

    // MikroTik operations
    Route::prefix('mikrotik')->group(function () {
        Route::get('/system', [MikrotikController::class, 'getSystem']);
        Route::get('/traffic', [MikrotikController::class, 'getTraffic']);
        Route::get('/interfaces', [MikrotikController::class, 'getInterfaces']);
        Route::get('/online-users', [MikrotikController::class, 'getOnlineUsers']);
        Route::get('/user-detail', [MikrotikController::class, 'getUserDetail']);
        Route::post('/create-user', [MikrotikController::class, 'createUser']);
        Route::put('/update-user', [MikrotikController::class, 'updateUser']);
        Route::delete('/delete-user', [MikrotikController::class, 'deleteUser']);
        Route::post('/toggle-user', [MikrotikController::class, 'toggleUser']);
        Route::post('/disconnect-user', [MikrotikController::class, 'disconnectUser']);
        Route::post('/sync-secret', [MikrotikController::class, 'syncSecret']);
        Route::post('/import-secrets', [MikrotikController::class, 'importSecrets']);
        Route::post('/sync-package', [MikrotikController::class, 'syncPackage']);
        Route::get('/profiles', [MikrotikController::class, 'getProfiles']);
        Route::post('/profiles', [MikrotikController::class, 'createProfile']);
        Route::put('/profiles/{name}', [MikrotikController::class, 'updateProfile']);
        Route::delete('/profiles/{name}', [MikrotikController::class, 'deleteProfile']);
    });
});

// Public routes (for customer payment portal)
Route::get('/invoices/{id}/public', [InvoiceController::class, 'publicShow']);

// Midtrans webhook (no auth, verified by signature)
Route::post('/midtrans/webhook', [PaymentController::class, 'handleWebhook']);
Route::post('/midtrans/snap-token', [PaymentController::class, 'createSnapToken']);
```

### Step 13: Start Laravel Server

```bash
php artisan serve
# Server running at http://localhost:8000
```

---

## ⚛️ Frontend Setup (React)

### Step 1: Environment Configuration

Create `.env.local` di root folder frontend:

```env
# Laravel Backend URL
VITE_API_URL=http://localhost:8000/api

# Supabase (optional - for additional features)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

### Step 2: Restart Frontend

```bash
# Jika menggunakan npm
npm run dev

# Jika menggunakan bun
bun dev
```

### Step 3: API Client Configuration

File `src/lib/api.ts` sudah dikonfigurasi untuk menggunakan `VITE_API_URL`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
```

### Step 4: Test API Connection

Gunakan komponen `ApiConnectionTest` di halaman Settings atau langsung test via browser:

```bash
# Test health endpoint
curl http://localhost:8000/api/health

# Expected response:
{
  "status": "ok",
  "message": "ISP Billing API is running",
  "timestamp": "2024-01-15T10:30:00+00:00"
}
```

---

## 🗄️ Database Configuration

### Tables Structure

```sql
-- Customers
CREATE TABLE customers (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Packages
CREATE TABLE packages (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bandwidth VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    type ENUM('pppoe', 'hotspot', 'static') DEFAULT 'pppoe',
    burst VARCHAR(100),
    priority INT DEFAULT 8,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE subscriptions (
    id CHAR(36) PRIMARY KEY,
    customer_id CHAR(36) NOT NULL,
    package_id CHAR(36) NOT NULL,
    mikrotik_username VARCHAR(100) NOT NULL,
    mikrotik_password VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('active', 'expired', 'suspended') DEFAULT 'active',
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (package_id) REFERENCES packages(id)
);

-- Invoices
CREATE TABLE invoices (
    id CHAR(36) PRIMARY KEY,
    subscription_id CHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('pending', 'paid', 'overdue', 'cancelled') DEFAULT 'pending',
    payment_reference VARCHAR(255),
    payment_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- Payments
CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY,
    invoice_id CHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(255),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);
```

---

## 🔌 MikroTik Integration

### Enable API on RouterOS

```bash
# Via Winbox atau terminal RouterOS
/ip service set api disabled=no port=8728
/ip service set api-ssl disabled=no port=8729

# Create API user
/user add name=api-user password=your_password group=full
```

### Test Connection

```bash
# Via Laravel artisan
php artisan tinker

# Test connection
$mikrotik = app(\App\Services\MikrotikService::class);
$mikrotik->testConnection();
```

---

## 📚 API Reference

### Base URL
```
Development: http://localhost:8000/api
Production: https://your-domain.com/api
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/mikrotik/test` | Test MikroTik connection |
| GET | `/mikrotik/resources` | Get system resources |
| GET | `/mikrotik/online-users` | Get online PPPoE/Hotspot users |
| GET | `/mikrotik/traffic` | Get interface traffic |
| POST | `/mikrotik/pppoe/create` | Create PPPoE secret |
| POST | `/mikrotik/pppoe/disable` | Disable PPPoE user |
| POST | `/mikrotik/pppoe/enable` | Enable PPPoE user |
| GET | `/customers` | List all customers |
| POST | `/customers` | Create customer |
| GET | `/customers/{id}` | Get customer detail |
| PUT | `/customers/{id}` | Update customer |
| DELETE | `/customers/{id}` | Delete customer |
| POST | `/midtrans/snap-token` | Create Midtrans payment token |
| POST | `/midtrans/webhook` | Handle Midtrans callback |

---

## 🔐 Environment Variables

### Backend (.env)

```env
# Application
APP_NAME="ISP Billing API"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=root
DB_PASSWORD=

# MikroTik
MIKROTIK_HOST=192.168.88.1
MIKROTIK_USER=admin
MIKROTIK_PASS=your_password
MIKROTIK_PORT=8728

# Midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
MIDTRANS_IS_PRODUCTION=false

# CORS
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env.local)

```env
# Backend API
VITE_API_URL=http://localhost:8000/api

# Midtrans Client (for Snap.js)
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxx
```

---

## 🧪 Testing & Debugging

### Test Backend

```bash
# Health check
curl http://localhost:8000/api/health

# MikroTik test
curl http://localhost:8000/api/mikrotik/test

# Get customers
curl http://localhost:8000/api/customers
```

### Debug Frontend

1. Buka Developer Tools (F12)
2. Tab Network - lihat request ke API
3. Tab Console - lihat error messages
4. Gunakan komponen `ApiConnectionTest`

### Common Issues

#### CORS Error
```
Access to XMLHttpRequest has been blocked by CORS policy
```
**Solution:** Pastikan `config/cors.php` sudah benar dan restart Laravel server.

#### Connection Refused
```
net::ERR_CONNECTION_REFUSED
```
**Solution:** Pastikan Laravel server running (`php artisan serve`).

#### 404 Not Found
```
GET http://localhost:8000/api/xxx 404 (Not Found)
```
**Solution:** Periksa route di `routes/api.php`.

---

## 🚀 Production Deployment

### Backend (Laravel)

1. **Server Requirements:**
   - VPS/Cloud Server (Ubuntu 22.04 recommended)
   - PHP 8.1+ dengan extensions
   - MySQL 8.0 / MariaDB
   - Nginx atau Apache
   - Supervisor (untuk queue workers)

2. **Deploy Steps:**

```bash
# Clone repository
git clone your-repo.git /var/www/isp-billing-api
cd /var/www/isp-billing-api

# Install dependencies
composer install --no-dev --optimize-autoloader

# Configure environment
cp .env.example .env
php artisan key:generate

# Setup database
php artisan migrate --force

# Optimize
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Set permissions
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
```

3. **Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
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

4. **Setup Cron (Billing Automation):**

```bash
# Add to crontab
* * * * * cd /var/www/isp-billing-api && php artisan schedule:run >> /dev/null 2>&1
```

### Frontend (React)

Build dan deploy ke Lovable atau hosting lain:

```bash
# Build production
npm run build

# Output di folder dist/
```

---

## ❓ Troubleshooting

### Backend Issues

| Issue | Solution |
|-------|----------|
| SQLSTATE Connection refused | Pastikan MySQL running |
| Class not found | Run `composer dump-autoload` |
| Permission denied | Fix permissions dengan `chmod` |
| MikroTik timeout | Check firewall, API service enabled |

### Frontend Issues

| Issue | Solution |
|-------|----------|
| CORS blocked | Update `config/cors.php`, restart Laravel |
| Network error | Check VITE_API_URL di `.env.local` |
| 401 Unauthorized | Check authentication token |
| Data not loading | Check API response di Network tab |

### MikroTik Issues

| Issue | Solution |
|-------|----------|
| Connection timeout | Check IP, port, firewall |
| Authentication failed | Verify username/password |
| API disabled | Enable API service di RouterOS |
| Legacy mode error | Use `'legacy' => true` in config |

---

## 📞 Support

- Documentation: `/docs` folder
- API Docs: http://localhost:8000/api/documentation
- MikroTik Wiki: https://wiki.mikrotik.com/wiki/Manual:API

---

**Happy Coding! 🚀**
