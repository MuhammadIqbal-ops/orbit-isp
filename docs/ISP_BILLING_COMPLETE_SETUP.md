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

// Health check
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'message' => 'ISP Billing API is running',
        'timestamp' => now()->toIso8601String()
    ]);
});

// MikroTik routes
Route::prefix('mikrotik')->group(function () {
    Route::get('/test', [MikrotikController::class, 'testConnection']);
    Route::get('/resources', [MikrotikController::class, 'getSystemResources']);
    Route::get('/online-users', [MikrotikController::class, 'getOnlineUsers']);
    Route::get('/traffic', [MikrotikController::class, 'getTraffic']);
    Route::post('/pppoe/create', [MikrotikController::class, 'createPPPoE']);
    Route::post('/pppoe/disable', [MikrotikController::class, 'disablePPPoE']);
    Route::post('/pppoe/enable', [MikrotikController::class, 'enablePPPoE']);
});

// CRUD routes
Route::apiResource('customers', CustomerController::class);
Route::apiResource('packages', PackageController::class);
Route::apiResource('subscriptions', SubscriptionController::class);
Route::apiResource('invoices', InvoiceController::class);
Route::apiResource('payments', PaymentController::class);

// Midtrans webhook
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
