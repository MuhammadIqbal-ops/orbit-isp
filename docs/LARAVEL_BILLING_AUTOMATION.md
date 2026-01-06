# Laravel Billing Automation Commands

Complete guide for setting up automated billing tasks using Laravel Console Commands and Crontab.

## Overview

These commands automate the billing cycle:
1. **Generate Invoices** - Create monthly invoices for active subscriptions
2. **Check Overdue** - Mark unpaid invoices as overdue
3. **Auto Suspend** - Disable MikroTik users with overdue invoices
4. **Auto Renew** - Renew subscriptions and generate new invoices

---

## Console Commands

### 1. Generate Monthly Invoices

**File:** `app/Console/Commands/GenerateInvoices.php`

```php
<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\BillingLog;
use Carbon\Carbon;
use Illuminate\Console\Command;

class GenerateInvoices extends Command
{
    protected $signature = 'billing:generate-invoices 
                            {--dry-run : Show what would be generated without creating}';
    
    protected $description = 'Generate monthly invoices for active subscriptions';

    public function handle()
    {
        $dryRun = $this->option('dry-run');
        $today = Carbon::today();
        $dueDate = $today->copy()->addDays(7); // Invoice due in 7 days
        
        $this->info("Generating invoices for " . $today->format('F Y'));
        
        // Get active subscriptions that need invoices this month
        $subscriptions = Subscription::with(['customer', 'package'])
            ->where('status', 'active')
            ->whereDoesntHave('invoices', function ($query) use ($today) {
                $query->whereMonth('created_at', $today->month)
                      ->whereYear('created_at', $today->year);
            })
            ->get();
        
        if ($subscriptions->isEmpty()) {
            $this->info('No subscriptions need invoices this month.');
            return 0;
        }
        
        $this->info("Found {$subscriptions->count()} subscriptions to invoice.");
        
        $created = 0;
        
        foreach ($subscriptions as $subscription) {
            $this->line("Processing: {$subscription->customer->name} - {$subscription->package->name}");
            
            if ($dryRun) {
                $this->warn("  [DRY-RUN] Would create invoice for Rp " . number_format($subscription->package->price));
                continue;
            }
            
            try {
                $invoice = Invoice::create([
                    'subscription_id' => $subscription->id,
                    'amount' => $subscription->package->price,
                    'due_date' => $dueDate,
                    'status' => 'unpaid',
                    'notes' => "Monthly invoice for {$today->format('F Y')}",
                ]);
                
                // Log the action
                BillingLog::create([
                    'action' => 'invoice_generated',
                    'subscription_id' => $subscription->id,
                    'invoice_id' => $invoice->id,
                    'message' => "Invoice #{$invoice->id} generated for Rp " . number_format($subscription->package->price),
                    'meta' => [
                        'customer_name' => $subscription->customer->name,
                        'package_name' => $subscription->package->name,
                        'amount' => $subscription->package->price,
                    ],
                ]);
                
                $created++;
                $this->info("  ✓ Invoice created: #{$invoice->id}");
                
            } catch (\Exception $e) {
                $this->error("  ✗ Failed: " . $e->getMessage());
                
                BillingLog::create([
                    'action' => 'invoice_generation_failed',
                    'subscription_id' => $subscription->id,
                    'message' => "Failed to generate invoice: " . $e->getMessage(),
                ]);
            }
        }
        
        $this->newLine();
        $this->info("Summary: {$created} invoices created.");
        
        return 0;
    }
}
```

---

### 2. Check Overdue Invoices

**File:** `app/Console/Commands/CheckOverdue.php`

```php
<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\BillingLog;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class CheckOverdue extends Command
{
    protected $signature = 'billing:check-overdue 
                            {--dry-run : Show what would be marked without updating}
                            {--notify : Send notifications for newly overdue invoices}';
    
    protected $description = 'Mark unpaid invoices as overdue if past due date';

    public function handle(NotificationService $notificationService)
    {
        $dryRun = $this->option('dry-run');
        $notify = $this->option('notify');
        $today = Carbon::today();
        
        $this->info("Checking for overdue invoices as of " . $today->format('Y-m-d'));
        
        // Get unpaid invoices past due date
        $invoices = Invoice::with(['subscription.customer', 'subscription.package'])
            ->where('status', 'unpaid')
            ->where('due_date', '<', $today)
            ->get();
        
        if ($invoices->isEmpty()) {
            $this->info('No overdue invoices found.');
            return 0;
        }
        
        $this->info("Found {$invoices->count()} overdue invoices.");
        
        $updated = 0;
        
        foreach ($invoices as $invoice) {
            $customer = $invoice->subscription->customer;
            $daysOverdue = $today->diffInDays($invoice->due_date);
            
            $this->line("Invoice #{$invoice->id} - {$customer->name} - {$daysOverdue} days overdue");
            
            if ($dryRun) {
                $this->warn("  [DRY-RUN] Would mark as overdue");
                continue;
            }
            
            try {
                $invoice->update(['status' => 'overdue']);
                
                BillingLog::create([
                    'action' => 'invoice_overdue',
                    'subscription_id' => $invoice->subscription_id,
                    'invoice_id' => $invoice->id,
                    'message' => "Invoice marked as overdue ({$daysOverdue} days)",
                    'meta' => [
                        'customer_name' => $customer->name,
                        'amount' => $invoice->amount,
                        'due_date' => $invoice->due_date,
                        'days_overdue' => $daysOverdue,
                    ],
                ]);
                
                // Send notification if enabled
                if ($notify) {
                    $notificationService->sendOverdueNotification($invoice);
                    $this->info("  ✓ Notification sent");
                }
                
                $updated++;
                $this->info("  ✓ Marked as overdue");
                
            } catch (\Exception $e) {
                $this->error("  ✗ Failed: " . $e->getMessage());
            }
        }
        
        $this->newLine();
        $this->info("Summary: {$updated} invoices marked as overdue.");
        
        return 0;
    }
}
```

---

### 3. Auto Suspend Overdue Subscriptions

**File:** `app/Console/Commands/AutoSuspend.php`

```php
<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\BillingLog;
use App\Services\MikrotikService;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class AutoSuspend extends Command
{
    protected $signature = 'billing:auto-suspend 
                            {--dry-run : Show what would be suspended without action}
                            {--grace-days=3 : Days after overdue before suspension}
                            {--notify : Send suspension notifications}';
    
    protected $description = 'Suspend subscriptions with overdue invoices and disable MikroTik users';

    public function handle(MikrotikService $mikrotik, NotificationService $notificationService)
    {
        $dryRun = $this->option('dry-run');
        $graceDays = (int) $this->option('grace-days');
        $notify = $this->option('notify');
        
        $this->info("Auto-suspend check (grace period: {$graceDays} days)");
        
        // Get active subscriptions with overdue invoices
        $subscriptions = Subscription::with(['customer', 'package', 'invoices'])
            ->where('status', 'active')
            ->whereHas('invoices', function ($query) use ($graceDays) {
                $query->where('status', 'overdue')
                      ->where('due_date', '<', now()->subDays($graceDays));
            })
            ->get();
        
        if ($subscriptions->isEmpty()) {
            $this->info('No subscriptions to suspend.');
            return 0;
        }
        
        $this->info("Found {$subscriptions->count()} subscriptions to suspend.");
        
        $suspended = 0;
        
        foreach ($subscriptions as $subscription) {
            $customer = $subscription->customer;
            $overdueInvoice = $subscription->invoices->where('status', 'overdue')->first();
            
            $this->line("Suspending: {$customer->name} ({$subscription->mikrotik_username})");
            
            if ($dryRun) {
                $this->warn("  [DRY-RUN] Would suspend subscription and disable MikroTik user");
                continue;
            }
            
            try {
                // Disable MikroTik PPPoE user
                $mikrotikResult = $mikrotik->disableUser($subscription->mikrotik_username);
                
                if (!$mikrotikResult['success']) {
                    throw new \Exception("MikroTik error: " . ($mikrotikResult['error'] ?? 'Unknown'));
                }
                
                // Update subscription status
                $subscription->update(['status' => 'suspended']);
                
                // Update customer status
                $customer->update(['status' => 'suspended']);
                
                BillingLog::create([
                    'action' => 'subscription_suspended',
                    'subscription_id' => $subscription->id,
                    'invoice_id' => $overdueInvoice->id,
                    'message' => "Subscription suspended due to overdue invoice",
                    'meta' => [
                        'customer_name' => $customer->name,
                        'mikrotik_username' => $subscription->mikrotik_username,
                        'overdue_amount' => $overdueInvoice->amount,
                    ],
                ]);
                
                // Send notification
                if ($notify) {
                    $notificationService->sendSuspensionNotification($subscription);
                    $this->info("  ✓ Notification sent");
                }
                
                $suspended++;
                $this->info("  ✓ Suspended (MikroTik user disabled)");
                
            } catch (\Exception $e) {
                $this->error("  ✗ Failed: " . $e->getMessage());
                
                BillingLog::create([
                    'action' => 'suspension_failed',
                    'subscription_id' => $subscription->id,
                    'message' => "Failed to suspend: " . $e->getMessage(),
                ]);
            }
        }
        
        $this->newLine();
        $this->info("Summary: {$suspended} subscriptions suspended.");
        
        return 0;
    }
}
```

---

### 4. Auto Renew Subscriptions

**File:** `app/Console/Commands/AutoRenew.php`

```php
<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\Invoice;
use App\Models\BillingLog;
use Carbon\Carbon;
use Illuminate\Console\Command;

class AutoRenew extends Command
{
    protected $signature = 'billing:auto-renew 
                            {--dry-run : Show what would be renewed without action}
                            {--days-before=7 : Days before end_date to check for renewal}';
    
    protected $description = 'Auto-renew subscriptions that are ending soon and have auto_renew enabled';

    public function handle()
    {
        $dryRun = $this->option('dry-run');
        $daysBefore = (int) $this->option('days-before');
        $today = Carbon::today();
        $checkDate = $today->copy()->addDays($daysBefore);
        
        $this->info("Auto-renewal check (looking {$daysBefore} days ahead)");
        
        // Get subscriptions ending soon with auto_renew enabled
        $subscriptions = Subscription::with(['customer', 'package'])
            ->where('status', 'active')
            ->where('auto_renew', true)
            ->whereBetween('end_date', [$today, $checkDate])
            ->get();
        
        if ($subscriptions->isEmpty()) {
            $this->info('No subscriptions to renew.');
            return 0;
        }
        
        $this->info("Found {$subscriptions->count()} subscriptions to renew.");
        
        $renewed = 0;
        
        foreach ($subscriptions as $subscription) {
            $customer = $subscription->customer;
            $package = $subscription->package;
            
            $this->line("Renewing: {$customer->name} - {$package->name}");
            
            if ($dryRun) {
                $this->warn("  [DRY-RUN] Would extend subscription and generate invoice");
                continue;
            }
            
            try {
                // Calculate new dates
                $currentEndDate = Carbon::parse($subscription->end_date);
                $newStartDate = $currentEndDate->copy()->addDay();
                $newEndDate = $newStartDate->copy()->addMonth();
                $invoiceDueDate = $newStartDate->copy()->addDays(7);
                
                // Update subscription dates
                $subscription->update([
                    'start_date' => $newStartDate,
                    'end_date' => $newEndDate,
                ]);
                
                // Generate new invoice for the renewal
                $invoice = Invoice::create([
                    'subscription_id' => $subscription->id,
                    'amount' => $package->price,
                    'due_date' => $invoiceDueDate,
                    'status' => 'unpaid',
                    'notes' => "Auto-renewal invoice for {$newStartDate->format('F Y')}",
                ]);
                
                BillingLog::create([
                    'action' => 'subscription_renewed',
                    'subscription_id' => $subscription->id,
                    'invoice_id' => $invoice->id,
                    'message' => "Subscription auto-renewed until {$newEndDate->format('Y-m-d')}",
                    'meta' => [
                        'customer_name' => $customer->name,
                        'package_name' => $package->name,
                        'new_start_date' => $newStartDate->format('Y-m-d'),
                        'new_end_date' => $newEndDate->format('Y-m-d'),
                        'invoice_amount' => $package->price,
                    ],
                ]);
                
                $renewed++;
                $this->info("  ✓ Renewed until {$newEndDate->format('Y-m-d')} (Invoice #{$invoice->id})");
                
            } catch (\Exception $e) {
                $this->error("  ✗ Failed: " . $e->getMessage());
                
                BillingLog::create([
                    'action' => 'renewal_failed',
                    'subscription_id' => $subscription->id,
                    'message' => "Failed to renew: " . $e->getMessage(),
                ]);
            }
        }
        
        $this->newLine();
        $this->info("Summary: {$renewed} subscriptions renewed.");
        
        return 0;
    }
}
```

---

### 5. Reactivate After Payment

**File:** `app/Console/Commands/ReactivateSubscriptions.php`

```php
<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\BillingLog;
use App\Services\MikrotikService;
use Illuminate\Console\Command;

class ReactivateSubscriptions extends Command
{
    protected $signature = 'billing:reactivate 
                            {--dry-run : Show what would be reactivated without action}';
    
    protected $description = 'Reactivate suspended subscriptions that have paid their overdue invoices';

    public function handle(MikrotikService $mikrotik)
    {
        $dryRun = $this->option('dry-run');
        
        $this->info("Checking for subscriptions to reactivate");
        
        // Get suspended subscriptions where all invoices are paid
        $subscriptions = Subscription::with(['customer', 'invoices'])
            ->where('status', 'suspended')
            ->whereDoesntHave('invoices', function ($query) {
                $query->whereIn('status', ['unpaid', 'overdue']);
            })
            ->get();
        
        if ($subscriptions->isEmpty()) {
            $this->info('No subscriptions to reactivate.');
            return 0;
        }
        
        $this->info("Found {$subscriptions->count()} subscriptions to reactivate.");
        
        $reactivated = 0;
        
        foreach ($subscriptions as $subscription) {
            $customer = $subscription->customer;
            
            $this->line("Reactivating: {$customer->name} ({$subscription->mikrotik_username})");
            
            if ($dryRun) {
                $this->warn("  [DRY-RUN] Would reactivate subscription and enable MikroTik user");
                continue;
            }
            
            try {
                // Enable MikroTik PPPoE user
                $mikrotikResult = $mikrotik->enableUser($subscription->mikrotik_username);
                
                if (!$mikrotikResult['success']) {
                    throw new \Exception("MikroTik error: " . ($mikrotikResult['error'] ?? 'Unknown'));
                }
                
                // Update subscription status
                $subscription->update(['status' => 'active']);
                
                // Update customer status
                $customer->update(['status' => 'active']);
                
                BillingLog::create([
                    'action' => 'subscription_reactivated',
                    'subscription_id' => $subscription->id,
                    'message' => "Subscription reactivated after payment",
                    'meta' => [
                        'customer_name' => $customer->name,
                        'mikrotik_username' => $subscription->mikrotik_username,
                    ],
                ]);
                
                $reactivated++;
                $this->info("  ✓ Reactivated (MikroTik user enabled)");
                
            } catch (\Exception $e) {
                $this->error("  ✗ Failed: " . $e->getMessage());
            }
        }
        
        $this->newLine();
        $this->info("Summary: {$reactivated} subscriptions reactivated.");
        
        return 0;
    }
}
```

---

## NotificationService

**File:** `app/Services/NotificationService.php`

```php
<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Subscription;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    protected $telegramBotToken;
    protected $telegramChatId;
    
    public function __construct()
    {
        $this->telegramBotToken = config('services.telegram.bot_token');
        $this->telegramChatId = config('services.telegram.chat_id');
    }
    
    public function sendTelegram(string $message): bool
    {
        if (!$this->telegramBotToken || !$this->telegramChatId) {
            Log::warning('Telegram not configured');
            return false;
        }
        
        try {
            $response = Http::post("https://api.telegram.org/bot{$this->telegramBotToken}/sendMessage", [
                'chat_id' => $this->telegramChatId,
                'text' => $message,
                'parse_mode' => 'HTML',
            ]);
            
            return $response->successful();
        } catch (\Exception $e) {
            Log::error('Telegram notification failed: ' . $e->getMessage());
            return false;
        }
    }
    
    public function sendOverdueNotification(Invoice $invoice): bool
    {
        $customer = $invoice->subscription->customer;
        
        $message = "⚠️ <b>Invoice Overdue</b>\n\n";
        $message .= "Customer: {$customer->name}\n";
        $message .= "Amount: Rp " . number_format($invoice->amount) . "\n";
        $message .= "Due Date: {$invoice->due_date}\n";
        $message .= "Invoice ID: #{$invoice->id}";
        
        return $this->sendTelegram($message);
    }
    
    public function sendSuspensionNotification(Subscription $subscription): bool
    {
        $customer = $subscription->customer;
        
        $message = "🔴 <b>Subscription Suspended</b>\n\n";
        $message .= "Customer: {$customer->name}\n";
        $message .= "Username: {$subscription->mikrotik_username}\n";
        $message .= "Reason: Overdue payment";
        
        return $this->sendTelegram($message);
    }
    
    public function sendPaymentNotification(Invoice $invoice, float $amount): bool
    {
        $customer = $invoice->subscription->customer;
        
        $message = "✅ <b>Payment Received</b>\n\n";
        $message .= "Customer: {$customer->name}\n";
        $message .= "Amount: Rp " . number_format($amount) . "\n";
        $message .= "Invoice ID: #{$invoice->id}";
        
        return $this->sendTelegram($message);
    }
}
```

---

## Kernel Scheduler Setup

**File:** `app/Console/Kernel.php`

```php
<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        // Generate invoices on 1st of each month at 00:00
        $schedule->command('billing:generate-invoices')
                 ->monthlyOn(1, '00:00')
                 ->withoutOverlapping()
                 ->appendOutputTo(storage_path('logs/billing.log'));
        
        // Check for overdue invoices daily at 08:00
        $schedule->command('billing:check-overdue --notify')
                 ->dailyAt('08:00')
                 ->withoutOverlapping()
                 ->appendOutputTo(storage_path('logs/billing.log'));
        
        // Auto-suspend check daily at 09:00 (3 days grace period)
        $schedule->command('billing:auto-suspend --grace-days=3 --notify')
                 ->dailyAt('09:00')
                 ->withoutOverlapping()
                 ->appendOutputTo(storage_path('logs/billing.log'));
        
        // Auto-renew check daily at 06:00 (7 days before end)
        $schedule->command('billing:auto-renew --days-before=7')
                 ->dailyAt('06:00')
                 ->withoutOverlapping()
                 ->appendOutputTo(storage_path('logs/billing.log'));
        
        // Reactivate after payment check every hour
        $schedule->command('billing:reactivate')
                 ->hourly()
                 ->withoutOverlapping()
                 ->appendOutputTo(storage_path('logs/billing.log'));
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
        require base_path('routes/console.php');
    }
}
```

---

## Crontab Setup

Add this single entry to your server's crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs Laravel scheduler every minute)
* * * * * cd /path/to/your/laravel-project && php artisan schedule:run >> /dev/null 2>&1
```

---

## Manual Command Usage

### Run with dry-run first (recommended)

```bash
# Test invoice generation
php artisan billing:generate-invoices --dry-run

# Test overdue check
php artisan billing:check-overdue --dry-run

# Test auto-suspend
php artisan billing:auto-suspend --dry-run --grace-days=3

# Test auto-renew
php artisan billing:auto-renew --dry-run --days-before=7

# Test reactivation
php artisan billing:reactivate --dry-run
```

### Run for real

```bash
# Generate invoices
php artisan billing:generate-invoices

# Check overdue with notifications
php artisan billing:check-overdue --notify

# Suspend with 5-day grace period
php artisan billing:auto-suspend --grace-days=5 --notify

# Renew subscriptions
php artisan billing:auto-renew

# Reactivate paid subscriptions
php artisan billing:reactivate
```

---

## Environment Configuration

Add to `.env`:

```env
# Telegram Notifications
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

Add to `config/services.php`:

```php
'telegram' => [
    'bot_token' => env('TELEGRAM_BOT_TOKEN'),
    'chat_id' => env('TELEGRAM_CHAT_ID'),
],
```

---

## Billing Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      MONTHLY BILLING CYCLE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1      → billing:generate-invoices                         │
│               Creates invoices for active subscriptions         │
│                                                                 │
│  Daily      → billing:check-overdue                             │
│               Marks unpaid invoices as overdue                  │
│                                                                 │
│  Daily      → billing:auto-suspend                              │
│               Suspends after grace period                       │
│               Disables MikroTik user                            │
│                                                                 │
│  Daily      → billing:auto-renew                                │
│               Extends subscription dates                        │
│               Creates new invoice                               │
│                                                                 │
│  Hourly     → billing:reactivate                                │
│               Reactivates paid subscriptions                    │
│               Enables MikroTik user                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supervisor Configuration (Optional)

For high-traffic ISPs, run scheduler with Supervisor:

**File:** `/etc/supervisor/conf.d/billing-scheduler.conf`

```ini
[program:billing-scheduler]
process_name=%(program_name)s
command=php /path/to/laravel/artisan schedule:work
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/path/to/laravel/storage/logs/scheduler.log
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start billing-scheduler
```
