<?php
// =========================================================
//  Fizzy durum sayfası için sunucu tarafı (status.html bunu okur).
//  GET                              -> herkese açık durum (JSON)
//  POST {action:"heartbeat", key}   -> Fizzy botu "çevrimiçiyim" sinyali (dakikada bir)
//  POST {action:"heartbeat", key, state:"offline"} -> bot kapanırken "çevrimdışıyım" sinyali
//  POST {action:"set", token, ...}  -> sahip: müsaitlik, not ve duyuru
//  Kullanıcı bilgisi, IP veya gizli ayar dışarı verilmez.
// =========================================================

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require __DIR__ . '/private/config.php';
require __DIR__ . '/guard.php';
require __DIR__ . '/shop_lib.php';

const STATUS_CACHE_SECONDS = 300;   // Discord ve katalog kontrolleri 5 dakikada bir yenilenir
const BOT_ONLINE_SECONDS   = 180;   // 3 dakikadır sinyal yoksa bot çevrimdışı sayılır

function reply_json(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function status_defaults(): array
{
    return [
        'heartbeat' => ['ts' => 0, 'version' => '', 'off' => false],
        'manual'    => ['availability' => 'available', 'note' => '', 'notice' => '', 'updated' => 0],
        'cache'     => ['ts' => 0, 'catalog' => null, 'discord' => null],
    ];
}

/** Durum kaydı: veritabanı ayarlıysa orada, yoksa durum klasöründe. */
function with_status(callable $fn)
{
    if (db_enabled()) {
        return with_db_doc('status', status_defaults(), $fn);
    }
    return with_json_file(state_dir(), 'fizzy_status', status_defaults(), $fn);
}

function heartbeat_key(): string
{
    return hash_hmac('sha256', 'fizzy-heartbeat', FIZZY_BOT_TOKEN);
}

// ---------- CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

// Hafif istek: sadece sipariş sayıları (mağaza her açılışta bunu ister; önbellek yok, hızlı)
if ($method === 'GET' && isset($_GET['orders'])) {
    reply_json(200, ['ok' => true, 'orders' => (object)order_counts(), 'ratings' => (object)ratings_summary()]);
}
// Hafif istek: bir ürünün onaylı yorumları (ürün sayfası)
if ($method === 'GET' && isset($_GET['reviews'])) {
    $key = is_string($_GET['reviews']) ? $_GET['reviews'] : '';
    try {
        reply_json(200, ['ok' => true, 'reviews' => (db_enabled() && preg_match('/^[a-z0-9_-]{1,64}$/', $key)) ? reviews_public($key) : []]);
    } catch (Throwable $e) {
        reply_json(200, ['ok' => true, 'reviews' => []]);
    }
}

// Vadesi gelen abonelikler: botun dakikalık sinyali ve sayfa ziyaretleri bu kontrolü tetikler
run_subscriptions();

// ---------- POST: bot sinyali veya sahip ayarı
if ($method === 'POST') {
    $in = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
    $in = is_array($in) ? $in : [];
    $action = is_string($in['action'] ?? null) ? $in['action'] : '';

    try {
        if ($action === 'heartbeat') {
            if (!hash_equals(heartbeat_key(), is_string($in['key'] ?? null) ? $in['key'] : '')) {
                reply_json(401, ['ok' => false, 'error' => 'Anahtar uyuşmuyor: .env ile config.php aynı bot token\'ını kullanmalı.']);
            }
            $version = cut_text(is_string($in['version'] ?? null) ? $in['version'] : '', 80);
            $off = ($in['state'] ?? '') === 'offline';
            with_status(function (array &$s) use ($version, $off) {
                $s['heartbeat'] = ['ts' => time(), 'version' => $version, 'off' => $off];
            });
            reply_json(200, ['ok' => true]);
        }

        if ($action === 'set') {
            if (!in_array($origin, ALLOWED_ORIGINS, true)) {
                reply_json(403, ['ok' => false, 'error' => 'This request isn\'t allowed.']);
            }
            $tok = read_token(is_string($in['token'] ?? null) ? $in['token'] : '', 'login');
            if ($tok === null || (string)($tok['id'] ?? '') !== (string)OWNER_DISCORD_ID) {
                reply_json(403, ['ok' => false, 'error' => 'Only the store owner can change the status.']);
            }
            $availability = is_string($in['availability'] ?? null) ? $in['availability'] : '';
            if (!in_array($availability, ['available', 'busy', 'away'], true)) {
                reply_json(400, ['ok' => false, 'error' => 'Invalid availability.']);
            }
            $clean = function ($v, int $max): string {
                $v = is_string($v) ? trim($v) : '';
                if (@preg_match('//u', $v) !== 1) {
                    return '';
                }
                $v = (string)preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
                return cut_text($v, $max);
            };
            $note = $clean($in['note'] ?? '', 140);
            $notice = $clean($in['notice'] ?? '', 240);
            with_status(function (array &$s) use ($availability, $note, $notice) {
                $s['manual'] = ['availability' => $availability, 'note' => $note, 'notice' => $notice, 'updated' => time()];
            });
            reply_json(200, ['ok' => true]);
        }
    } catch (Throwable $e) {
        error_log('Fizzy status (POST) failed: ' . $e->getMessage());
        reply_json(500, ['ok' => false, 'error' => 'Status couldn\'t be saved.']);
    }
    reply_json(400, ['ok' => false, 'error' => 'Unknown action.']);
}

if ($method !== 'GET') {
    reply_json(405, ['ok' => false]);
}

// ---------- GET: herkese açık durum
$services = [];
$storeOk = true;

// 1) CW Credits ve kayıtlar (veritabanı)
$dbOk = true;
try {
    if (db_enabled()) {
        db()->query('SELECT 1');
    } elseif (!can_write_dir(__DIR__ . '/private')) {
        $dbOk = false;
    }
} catch (Throwable $e) {
    error_log('Fizzy status: database check failed: ' . $e->getMessage());
    $dbOk = false;
}

// 2) Kayıtlı durum (önbellek, bot sinyali, müsaitlik)
$saved = status_defaults();
$storeError = false;
try {
    $saved = with_status(function (array &$s) {
        return $s;
    });
} catch (Throwable $e) {
    error_log('Fizzy status: state read failed: ' . $e->getMessage());
    $storeError = true;
}

// 3) Katalog (GitHub) ve Discord (bot token) kontrolü: 5 dakikada bir
$cache = $saved['cache'];
if (time() - (int)$cache['ts'] > STATUS_CACHE_SECONDS) {
    $cache['catalog'] = fetch_catalog() !== null;
    $api = (string)g_const('DISCORD_API_BASE', 'https://discord.com/api/v10');
    [$code] = http_json('GET', $api . '/users/@me', [
        'Authorization: Bot ' . FIZZY_BOT_TOKEN,
        'User-Agent: DiscordBot (https://cwplaymusic.com, 1.0)',
    ]);
    $cache['discord'] = $code === 200 ? 'ok' : ($code === 401 ? 'token' : 'down');
    $cache['ts'] = time();
    if (!$storeError) {
        try {
            with_status(function (array &$s) use ($cache) {
                $s['cache'] = $cache;
            });
        } catch (Throwable $e) {
            error_log('Fizzy status: cache write failed: ' . $e->getMessage());
        }
    }
}

$loginReady = (string)g_const('DISCORD_CLIENT_ID', '') !== '' && (string)g_const('DISCORD_CLIENT_SECRET', '') !== '';
$discord = $cache['discord'];

$services[] = ['id' => 'orders', 'name' => 'Store & orders',
    'status' => $cache['catalog'] === false ? 'degraded' : 'ok',
    'detail' => $cache['catalog'] === false ? 'The catalog can\'t be read right now, so orders may fail.' : ''];
$services[] = ['id' => 'login', 'name' => 'Discord login',
    'status' => $loginReady ? 'ok' : 'down',
    'detail' => $loginReady ? '' : 'Discord login isn\'t set up.'];
$services[] = ['id' => 'delivery', 'name' => 'Order delivery to Discord',
    'status' => $discord === 'ok' ? 'ok' : 'down',
    'detail' => $discord === 'ok' ? '' : ($discord === 'token' ? 'Fizzy can\'t sign in to Discord right now.' : 'Discord can\'t be reached right now.')];
$services[] = ['id' => 'credits', 'name' => 'CW Credits',
    'status' => ($dbOk && !$storeError) ? 'ok' : 'down',
    'detail' => ($dbOk && !$storeError) ? '' : 'Balances can\'t be read or saved right now.'];

$hb = (int)$saved['heartbeat']['ts'];
$botOff = !empty($saved['heartbeat']['off']); // bot kapanırken haber verdiyse hemen çevrimdışı
$bot = ['status' => $hb === 0 ? 'unknown' : ((!$botOff && time() - $hb <= BOT_ONLINE_SECONDS) ? 'online' : 'offline'), 'last_seen' => $hb ?: null];

$manual = $saved['manual'];
reply_json(200, [
    'ok' => true,
    'ts' => time(),
    'services' => $services,
    'bot' => $bot,
    'availability' => ['state' => $manual['availability'], 'note' => $manual['note'], 'updated' => $manual['updated'] ?: null],
    'notice' => $manual['notice'] !== '' ? ['text' => $manual['notice'], 'updated' => $manual['updated']] : null,
    'orders' => (object)order_counts(), // ürün başına yeni sipariş sayısı (sitede catalog.json'daki sayıya eklenir)
]);
