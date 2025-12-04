# Tutorial Lengkap: Integrasi Laravel Backend ke React Frontend

Panduan step-by-step untuk menghubungkan Laravel API backend dengan React frontend untuk ISP Billing System.

---

## 📋 Daftar Isi

1. [Persiapan Environment](#1-persiapan-environment)
2. [Setup Laravel Backend](#2-setup-laravel-backend)
3. [Setup Frontend React](#3-setup-frontend-react)
4. [Konfigurasi CORS](#4-konfigurasi-cors)
5. [Testing Koneksi API](#5-testing-koneksi-api)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Persiapan Environment

### Requirement

| Software | Version | Download |
|----------|---------|----------|
| XAMPP | 8.2+ | [Download](https://www.apachefriends.org/) |
| Composer | 2.x | [Download](https://getcomposer.org/) |
| Node.js | 18+ | [Download](https://nodejs.org/) |
| Git | Latest | [Download](https://git-scm.com/) |

### Struktur Folder

```
C:\xampp\htdocs\
├── isp-billing-api/     # Laravel Backend
└── isp-billing-frontend/ # React Frontend (opsional, bisa di folder lain)
```

---

## 2. Setup Laravel Backend

### 2.1 Buat Project Laravel

```bash
cd C:\xampp\htdocs
composer create-project laravel/laravel isp-billing-api
cd isp-billing-api
```

### 2.2 Konfigurasi Database

Edit file `.env`:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=isp_billing
DB_USERNAME=root
DB_PASSWORD=
```

### 2.3 Buat Database

1. Start XAMPP (Apache & MySQL)
2. Buka phpMyAdmin: http://localhost/phpmyadmin
3. Buat database baru: `isp_billing`

### 2.4 Install Dependencies

```bash
# Laravel Sanctum untuk API Authentication
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"

# MikroTik RouterOS API
composer require evilfreelancer/routeros-api-php

# Midtrans Payment Gateway
composer require midtrans/midtrans-php
```

### 2.5 Buat Health Check Endpoint

Buat file `routes/api.php`:

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Health Check Endpoint (untuk test koneksi)
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'message' => 'Laravel API is running',
        'timestamp' => now()->toIso8601String(),
        'version' => app()->version(),
    ]);
});

// Public routes
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register', [AuthController::class, 'register']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/user', [AuthController::class, 'user']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    
    // Tambahkan route lainnya di sini...
});
```

### 2.6 Jalankan Laravel Server

```bash
cd C:\xampp\htdocs\isp-billing-api
php artisan serve

# Output:
# INFO  Server running on [http://127.0.0.1:8000].
```

**Test di browser:** http://localhost:8000/api/health

Response yang diharapkan:
```json
{
  "status": "ok",
  "message": "Laravel API is running",
  "timestamp": "2024-01-15T10:30:00+07:00",
  "version": "11.x.x"
}
```

---

## 3. Setup Frontend React

### 3.1 Buat File Environment

Buat file `.env.local` di root folder frontend:

```env
# Laravel API URL
VITE_API_URL=http://localhost:8000/api

# Midtrans (opsional, untuk payment)
VITE_MIDTRANS_CLIENT_KEY=your_midtrans_client_key
VITE_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js
```

### 3.2 Restart Frontend

**PENTING:** Setelah membuat/mengubah `.env.local`, WAJIB restart frontend:

```bash
# Stop frontend (Ctrl+C), lalu:
npm run dev
```

### 3.3 Verifikasi Environment Variable

Buka browser console (F12) dan cek log:

```
🔗 API URL: http://localhost:8000/api
```

Jika masih menampilkan URL lama, pastikan:
1. File `.env.local` sudah tersimpan
2. Frontend sudah di-restart
3. Cache browser sudah di-clear (Ctrl+Shift+R)

---

## 4. Konfigurasi CORS

### 4.1 Edit `config/cors.php` di Laravel

```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    
    'allowed_methods' => ['*'],
    
    'allowed_origins' => [
        'http://localhost:5173',   // Vite default
        'http://localhost:8080',   // Alternative port
        'http://localhost:3000',   // Create React App
        'http://127.0.0.1:5173',
        'https://*.lovableproject.com', // Lovable preview
        'https://*.lovable.app',        // Lovable production
    ],
    
    'allowed_origins_patterns' => [
        '#^https://.*\.lovableproject\.com$#',
        '#^https://.*\.lovable\.app$#',
    ],
    
    'allowed_headers' => ['*'],
    
    'exposed_headers' => [],
    
    'max_age' => 0,
    
    'supports_credentials' => true,
];
```

### 4.2 Update `app/Http/Kernel.php` (Laravel 10)

Pastikan CORS middleware aktif:

```php
protected $middleware = [
    \Illuminate\Http\Middleware\HandleCors::class, // Pastikan ada
    // ... middleware lainnya
];
```

### 4.3 Untuk Laravel 11+

Edit `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->api(prepend: [
        \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
    ]);
})
```

---

## 5. Testing Koneksi API

### 5.1 Test Manual dengan Browser

1. Buka: http://localhost:8000/api/health
2. Harus muncul JSON response

### 5.2 Test dengan cURL (Command Line)

```bash
curl -X GET http://localhost:8000/api/health -H "Accept: application/json"
```

### 5.3 Test dari Frontend

Buat komponen test atau jalankan di browser console:

```javascript
// Di browser console (F12 > Console)
fetch('http://localhost:8000/api/health')
  .then(res => res.json())
  .then(data => console.log('✅ Connected:', data))
  .catch(err => console.error('❌ Error:', err));
```

### 5.4 Gunakan ApiConnectionTest Component

Buat file `src/components/ApiConnectionTest.tsx`:

```tsx
import { useState } from 'react';
import { testApiConnection } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export function ApiConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    connected: boolean;
    url: string;
    message: string;
    latency?: number;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    const res = await testApiConnection();
    setResult(res);
    setTesting(false);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          API Connection Test
          {result && (
            <Badge variant={result.connected ? 'default' : 'destructive'}>
              {result.connected ? 'Connected' : 'Disconnected'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <strong>API URL:</strong> {result?.url || import.meta.env.VITE_API_URL || 'Not set'}
        </div>
        
        {result && (
          <div className={`p-3 rounded-lg ${result.connected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <div className="flex items-center gap-2">
              {result.connected ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span>{result.message}</span>
            </div>
            {result.latency && (
              <div className="text-xs mt-1">Latency: {result.latency}ms</div>
            )}
          </div>
        )}
        
        <Button onClick={handleTest} disabled={testing} className="w-full">
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Test Connection
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 6. Troubleshooting

### ❌ Error: "Failed to fetch" atau "Network Error"

**Penyebab:**
1. Laravel server belum running
2. CORS belum dikonfigurasi
3. URL API salah

**Solusi:**
```bash
# 1. Pastikan Laravel running
cd C:\xampp\htdocs\isp-billing-api
php artisan serve

# 2. Cek CORS config
# 3. Pastikan .env.local sudah benar
```

### ❌ Error: "CORS policy: No 'Access-Control-Allow-Origin'"

**Solusi:**
1. Edit `config/cors.php` seperti di atas
2. Tambahkan origin frontend ke `allowed_origins`
3. Restart Laravel: `php artisan serve`

### ❌ Error: "404 Not Found"

**Penyebab:**
1. Route tidak ada
2. URL endpoint salah

**Solusi:**
```bash
# Cek semua route yang terdaftar
php artisan route:list

# Pastikan endpoint benar, contoh:
# GET http://localhost:8000/api/health ✅
# GET http://localhost:8000/health ❌ (tanpa /api)
```

### ❌ Error: "401 Unauthorized"

**Penyebab:** Endpoint membutuhkan authentication

**Solusi:**
1. Login terlebih dahulu
2. Simpan token
3. Kirim token di header: `Authorization: Bearer {token}`

### ❌ Error: "500 Internal Server Error"

**Solusi:**
```bash
# Cek Laravel error log
cat storage/logs/laravel.log

# Atau di Windows:
type storage\logs\laravel.log
```

### ❌ Environment Variable Tidak Terbaca

**Solusi:**
1. Pastikan file bernama `.env.local` (bukan `.env.local.txt`)
2. Variabel HARUS dimulai dengan `VITE_`
3. Restart frontend server
4. Clear browser cache (Ctrl+Shift+R)

---

## 📝 Quick Reference

### Environment Variables Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Laravel API base URL | `http://localhost:8000/api` |
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans client key | `SB-Mid-client-xxx` |
| `VITE_MIDTRANS_SNAP_URL` | Midtrans Snap JS URL | `https://app.sandbox.midtrans.com/snap/snap.js` |

### Common API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User register |
| GET | `/api/auth/user` | Get current user |
| GET | `/api/customers` | List customers |
| GET | `/api/packages` | List packages |
| GET | `/api/subscriptions` | List subscriptions |
| GET | `/api/invoices` | List invoices |
| GET | `/api/mikrotik/system` | MikroTik system info |

### Laravel Commands

```bash
# Start server
php artisan serve

# List routes
php artisan route:list

# Clear cache
php artisan cache:clear
php artisan config:clear
php artisan route:clear

# Run migrations
php artisan migrate

# Create controller
php artisan make:controller Api/CustomerController --api
```

---

## ✅ Checklist Integrasi

- [ ] Laravel project dibuat dan dikonfigurasi
- [ ] Database MySQL dibuat dan connected
- [ ] Health check endpoint aktif (`/api/health`)
- [ ] CORS dikonfigurasi untuk origin frontend
- [ ] File `.env.local` dibuat di frontend
- [ ] `VITE_API_URL` diset ke `http://localhost:8000/api`
- [ ] Frontend server di-restart
- [ ] Test koneksi berhasil dari browser console
- [ ] Authentication flow berfungsi (login/logout)

---

## 🔗 Link Dokumentasi Terkait

- [LARAVEL_XAMPP_SETUP.md](./LARAVEL_XAMPP_SETUP.md) - Setup detail XAMPP + Laravel
- [LARAVEL_MIKROTIK_COMPLETE_GUIDE.md](./LARAVEL_MIKROTIK_COMPLETE_GUIDE.md) - Integrasi MikroTik
- [COMPLETE_LARAVEL_INTEGRATION.md](./COMPLETE_LARAVEL_INTEGRATION.md) - Dokumentasi lengkap
