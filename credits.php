<?php
// =========================================================
//  CW Credits: cüzdan, kredi talebi, kredi ile satın alma ve yönetim.
//  Site (cwplaymusic.com) bu dosyaya POST ile JSON gönderir:
//    { "action": "...", "token": "<Discord giriş jetonu>", ... }
//  Kullanıcı işlemleri: wallet, request, buy, buy_cart (sepet)
//  Yönetim (sadece OWNER_DISCORD_ID): admin_list, admin_decide, admin_adjust
//  CW Credits parayla alınamaz, paraya çevrilemez. Talepleri sahibi elle onaylar.
// =========================================================

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require __DIR__ . '/private/config.php';
require __DIR__ . '/guard.php';
require __DIR__ . '/shop_lib.php';

function out(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- CORS ve köken denetimi (order.php ile aynı)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    out(405, ['ok' => false, 'error' => 'Not allowed.']);
}
if (!in_array($origin, ALLOWED_ORIGINS, true)) {
    out(403, ['ok' => false, 'error' => 'This request isn\'t allowed.']);
}

$in = json_decode((string)file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024), true); // teslimat dosyası yüklemesi için büyük
if (!is_array($in)) {
    out(400, ['ok' => false, 'error' => 'Invalid request.']);
}
function field(array $in, string $name): string
{
    return (isset($in[$name]) && is_string($in[$name])) ? trim($in[$name]) : '';
}

// ---------- Giriş zorunlu
$tok = read_token(field($in, 'token'), 'login');
if ($tok === null || !valid_account_id((string)($tok['id'] ?? ''))) {
    out(401, ['ok' => false, 'login' => true, 'error' => 'Log in to use CW Credits.']);
}
$uid     = (string)$tok['id'];
$uname   = (string)$tok['u'];
$isOwner = ($uid === (string)OWNER_DISCORD_ID);
$action  = field($in, 'action');
$code    = ip_code(client_ip());
$siteUrl = rtrim((string)g_const('SITE_RETURN_URL', 'https://cwplaymusic.com/'), '/');
$maxRequest = (int)g_const('CREDITS_REQUEST_MAX', 100000);

function check_note(string $note): string
{
    if (@preg_match('//u', $note) !== 1) {
        out(400, ['ok' => false, 'error' => 'Invalid characters in your note.']);
    }
    $note = (string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $note);
    if (text_length($note) > 200) {
        out(400, ['ok' => false, 'error' => 'Keep your note under 200 characters.']);
    }
    if ($note !== '' && (has_bad_words($note) || has_link($note))) {
        out(422, ['ok' => false, 'error' => 'Please remove inappropriate language or links from your note.']);
    }
    return $note;
}

function require_owner(bool $isOwner): void
{
    if (!$isOwner) {
        out(403, ['ok' => false, 'error' => 'This page is only for the store owner.']);
    }
}

function not_banned(string $code, string $uid): void
{
    try {
        if (is_banned($code) || is_id_banned($uid)) {
            out(403, ['ok' => false, 'error' => 'Your account is blocked from the store.']);
        }
    } catch (Throwable $e) {
        error_log('Fizzy credits (ban check) failed: ' . $e->getMessage());
    }
}

/** Priority Listeners aboneliğinde YouTube kanalı zorunlu (teslim edilince Early Access sayfasında görünür). */
function listener_channel(array $in, string $key): string
{
    if (!in_array($key, ['priority-listeners', 'creator-license'], true)) { // Creator License: lisansın verildiği kanal
        return '';
    }
    $url = trim(field($in, 'youtube'));
    if ($url !== '' && !preg_match('~^https?://~i', $url)) {
        $url = 'https://' . $url;
    }
    if (!preg_match('~^https?://(www\.|m\.)?youtube\.com/(@[A-Za-z0-9._-]{3,30}|channel/UC[A-Za-z0-9_-]{22}|c/[A-Za-z0-9._-]{1,100}|user/[A-Za-z0-9._-]{1,100})/?$~', $url)) {
        out(400, ['ok' => false, 'error' => 'Add your YouTube channel link, e.g. https://youtube.com/@yourchannel']);
    }
    return rtrim($url, '/');
}

function public_request(array $r): array
{
    return ['id' => $r['id'], 'amount' => $r['amount'], 'note' => $r['note'], 'status' => $r['status'], 'ts' => $r['ts'], 'decided' => $r['decided'] ?? null];
}

try {
    run_subscriptions(); // vadesi gelen abonelikler (en fazla dakikada bir)
    switch ($action) {

        // ---------- Cüzdan: bakiye, talepler, hareketler
        case 'wallet':
            $res = with_credits(function (array &$c) use ($uid) {
                $mine = array_values(array_filter($c['requests'], fn($r) => $r['uid'] === $uid));
                $hist = array_values(array_filter($c['ledger'], fn($l) => $l['uid'] === $uid));
                return [
                    'balance'  => (int)($c['balances'][$uid]['bal'] ?? 0),
                    'requests' => array_map('public_request', array_slice(array_reverse($mine), 0, 10)),
                    'history'  => array_map(fn($l) => ['ts' => $l['ts'], 'delta' => $l['delta'], 'reason' => $l['reason'], 'bal' => $l['bal']],
                        array_slice(array_reverse($hist), 0, 20)),
                    'subs'     => array_map(function ($x) use ($c) {
                        $p = public_sub($x);
                        if (!empty($x['license'])) {
                            $p['devices'] = count($c['licenses'][$x['license']]['devices'] ?? []);
                        }
                        return $p;
                    }, array_slice(array_reverse(array_values(array_filter($c['subs'], fn($x) => $x['uid'] === $uid))), 0, 10)),
                    'max_devices' => (int)g_const('LICENSE_MAX_DEVICES', 2),
                ];
            });
            out(200, ['ok' => true, 'user' => $uname, 'owner' => $isOwner] + $res);

        // ---------- Kredi talebi
        case 'request':
            not_banned($code, $uid);
            $raw = $in['amount'] ?? null;
            if (!is_int($raw) && !(is_string($raw) && preg_match('/^\d{1,9}$/', $raw))) {
                out(400, ['ok' => false, 'error' => 'Enter a whole number of CW Credits.']);
            }
            $amount = (int)$raw;
            if ($amount < 1 || $amount > $maxRequest) {
                out(400, ['ok' => false, 'error' => 'You can request between 1 and ' . number_format($maxRequest) . ' CW Credits at a time.']);
            }
            $note = check_note(field($in, 'note'));

            $req = with_credits(function (array &$c) use ($uid, $uname, $amount, $note) {
                foreach ($c['requests'] as $r) {
                    if ($r['uid'] === $uid && $r['status'] === 'pending') {
                        return null;
                    }
                }
                $r = ['id' => 'r' . bin2hex(random_bytes(5)), 'uid' => $uid, 'u' => $uname, 'amount' => $amount,
                    'note' => $note, 'status' => 'pending', 'ts' => time()];
                $c['requests'][] = $r;
                // Bekleyenlerin hepsi + son 300 karar verilmiş talep tutulur
                $pending = array_filter($c['requests'], fn($x) => $x['status'] === 'pending');
                $done = array_slice(array_filter($c['requests'], fn($x) => $x['status'] !== 'pending'), -300);
                $c['requests'] = array_values(array_merge($done, $pending));
                return $r;
            });
            if ($req === null) {
                out(409, ['ok' => false, 'error' => 'You already have a request waiting for approval.']);
            }

            owner_notify([
                'allowed_mentions' => ['parse' => []],
                'embeds' => [[
                    'title'  => '💰 Yeni CW Credits talebi',
                    'color'  => 0x087A43,
                    'fields' => [
                        ['name' => 'Kullanıcı', 'value' => account_label($uid, $uname), 'inline' => true],
                        ['name' => 'Miktar', 'value' => number_format($amount) . ' CW Credits', 'inline' => true],
                        ['name' => 'Not', 'value' => $note !== '' ? $note : '—', 'inline' => false],
                        ['name' => 'Yönetim', 'value' => '[Talepleri aç](' . $siteUrl . '/admin.html)', 'inline' => false],
                    ],
                    'timestamp' => gmdate('c'),
                ]],
            ]);
            out(200, ['ok' => true, 'request' => public_request($req)]);

        // ---------- Kredi ile satın alma
        case 'buy':
            not_banned($code, $uid);
            $key = field($in, 'product');
            if (!empty($in['website'])) {
                out(200, ['ok' => true]); // tuzak alan: bot
            }
            $note = check_note(field($in, 'message'));
            $catalog = fetch_catalog();
            if ($catalog === null) {
                out(503, ['ok' => false, 'error' => 'The catalog couldn\'t be checked right now. Try again in a few minutes.']);
            }
            $product = find_product($catalog, $key);
            if ($product === null) {
                out(404, ['ok' => false, 'error' => 'This product isn\'t in the store anymore.']);
            }
            $price = (int)($product['credits'] ?? 0);
            if ($price <= 0) {
                out(409, ['ok' => false, 'error' => 'This product isn\'t sold for CW Credits.']);
            }
            if (is_subscription($product)) {
                out(409, ['ok' => false, 'error' => 'This is a subscription. Use the Subscribe button on its page.']);
            }
            if (($product['status'] ?? '') !== 'open') {
                out(409, ['ok' => false, 'error' => 'This product is full right now.']);
            }
            $name = (string)($product['name'] ?? $key);
            $listPrice = $price;
            $disc = discount_for($key, $uid, 1); // indirim (en büyüğü), fiyatı sunucu hesaplar
            $price = discounted($price, $disc['percent']);
            $gift = campaign_gift([$key], $catalog); // kampanya: bunu alana hediye ürün

            // 1) Bakiyeyi düş ve kaydet
            $after = with_credits(function (array &$c) use ($uid, $uname, $price, $name) {
                $bal = (int)($c['balances'][$uid]['bal'] ?? 0);
                if ($bal < $price) {
                    return -1 - $bal; // yetersiz: negatif değerle mevcut bakiyeyi taşı
                }
                $c['balances'][$uid] = ['u' => $uname, 'bal' => $bal - $price];
                credits_ledger($c, $uid, $uname, -$price, 'Purchase: ' . $name);
                return $bal - $price;
            });
            if ($after < 0) {
                $have = -1 - $after;
                out(402, ['ok' => false, 'balance' => $have,
                    'error' => 'Not enough CW Credits. You have ' . number_format($have) . ', this costs ' . number_format($price) . '.']);
            }

            // 2) Siparişi sahibe ilet; iletilemezse krediyi geri ver
            $title = (($product['id'] ?? null) !== null ? '#' . $product['id'] . ' — ' : '') . $name;
            $controls = 'IP kodu: `' . $code . '`' . "\n" . '[🚫 IP\'yi engelle](' . signed_link('ban', $code) . ') • [🚫 Hesabı engelle](' . signed_link('banid', $uid) . ')';
            $sent = owner_notify([
                'allowed_mentions' => ['parse' => []],
                'embeds' => [[
                    'title'  => '🛒 CW Credits ile sipariş',
                    'color'  => 0x2E8B57,
                    'fields' => [
                        ['name' => 'Ürün', 'value' => $title, 'inline' => false],
                        ['name' => 'Kullanıcı', 'value' => account_label($uid, $uname), 'inline' => true],
                        ['name' => 'Ödenen', 'value' => number_format($price) . ' CW Credits' . ($disc['percent'] ? " (%{$disc['percent']} indirim)" : ''), 'inline' => true],
                        ['name' => 'Kalan bakiye', 'value' => number_format($after) . ' CW Credits', 'inline' => true],
                        ['name' => 'Not', 'value' => $note !== '' ? $note : '—', 'inline' => false],
                        ['name' => 'Denetim', 'value' => $controls, 'inline' => false],
                    ],
                    'timestamp' => gmdate('c'),
                ]],
            ]);
            if (!$sent) {
                $after = with_credits(function (array &$c) use ($uid, $uname, $price, $name) {
                    $bal = (int)($c['balances'][$uid]['bal'] ?? 0) + $price;
                    $c['balances'][$uid] = ['u' => $uname, 'bal' => $bal];
                    credits_ledger($c, $uid, $uname, $price, 'Refund: ' . $name . ' (order couldn\'t be delivered)');
                    return $bal;
                });
                out(502, ['ok' => false, 'balance' => $after,
                    'error' => 'Your order couldn\'t be delivered, so your CW Credits were returned. Try again later.']);
            }
            count_order($key);
            $orderItems = [['key' => $key, 'name' => $name, 'price' => $price]];
            if ($gift) {
                $orderItems[] = $gift;
                owner_notify(['allowed_mentions' => ['parse' => []], 'content' => "🎁 Kampanya: bu siparişe hediye eklendi: **{$gift['name']}** ({$uname})"]);
            }
            $orderNo = create_order($uid, $uname, 'credits', $orderItems, $note);
            out(200, ['ok' => true, 'balance' => $after, 'order' => $orderNo, 'paid' => $price, 'list_price' => $listPrice, 'discount' => $disc,
                'gift' => $gift ? $gift['name'] : null]);

        // ---------- Sepet: birden fazla ürünü tek seferde kredi ile satın alma (ya hepsi ya hiçbiri)
        case 'buy_cart':
            not_banned($code, $uid);
            if (!empty($in['website'])) {
                out(200, ['ok' => true]); // tuzak alan: bot
            }
            $keys = $in['products'] ?? null;
            if (!is_array($keys) || !$keys || count($keys) > 10) {
                out(400, ['ok' => false, 'error' => 'Your cart is empty or has too many items (max 10).']);
            }
            $keys = array_values(array_unique(array_filter($keys, 'is_string')));
            $note = check_note(field($in, 'message'));
            $catalog = fetch_catalog();
            if ($catalog === null) {
                out(503, ['ok' => false, 'error' => 'The catalog couldn\'t be checked right now. Try again in a few minutes.']);
            }
            $items = [];
            $total = 0;
            foreach ($keys as $k) {
                $p = find_product($catalog, $k);
                if ($p === null) {
                    out(404, ['ok' => false, 'error' => 'An item in your cart isn\'t in the store anymore. Remove it and try again.']);
                }
                $price = (int)($p['credits'] ?? 0);
                $name = (string)($p['name'] ?? $k);
                if ($price <= 0) {
                    out(409, ['ok' => false, 'error' => $name . ' isn\'t sold for CW Credits.']);
                }
                if (is_subscription($p)) {
                    out(409, ['ok' => false, 'error' => $name . ' is a subscription and can\'t be bought from the cart.']);
                }
                if (($p['status'] ?? '') !== 'open') {
                    out(409, ['ok' => false, 'error' => $name . ' is full right now. Remove it from your cart.']);
                }
                $base = (($p['id'] ?? null) !== null ? '#' . $p['id'] . ' — ' : '') . $name;
                $items[] = ['title' => $base, 'base' => $base, 'name' => $name, 'price' => $price, 'list' => $price, 'key' => $k];
            }
            // indirimler: her ürün için en büyüğü (mağaza indirimi, sepet indirimi ya da ilk alışveriş)
            $dset = discount_settings();
            $first = $dset['first']['on'] ? is_first_purchase($uid) : false;
            $listTotal = 0;
            foreach ($items as $i => $it) {
                $dd = discount_for($it['key'], $uid, count($keys), $dset, $first);
                $listTotal += $it['price'];
                $items[$i]['price'] = discounted($it['price'], $dd['percent']);
                $items[$i]['percent'] = $dd['percent'];
                if ($dd['percent']) {
                    $items[$i]['title'] .= " (%{$dd['percent']} indirim)";
                }
                $total += $items[$i]['price'];
            }
            // kampanya "X al, Y öde": indirimlerle birleşmez; müşteri için hangisi ucuzsa o
            $camp = campaign_settings();
            $freeIdx = multi_free_indexes(array_map(fn($it) => ['key' => $it['key'], 'price' => $it['list']], $items), $camp['multi']);
            $multiUsed = false;
            if ($freeIdx) {
                $multiTotal = 0;
                foreach ($items as $i => $it) {
                    $multiTotal += in_array($i, $freeIdx, true) ? 0 : $it['list'];
                }
                if ($multiTotal < $total) {
                    foreach ($items as $i => $it) {
                        $free = in_array($i, $freeIdx, true);
                        $items[$i]['price'] = $free ? 0 : $it['list'];
                        $items[$i]['percent'] = 0;
                        $items[$i]['title'] = $it['base'] . ($free ? ' (🎁 free: buy ' . $camp['multi']['buy'] . ', pay ' . $camp['multi']['pay'] . ')' : '');
                    }
                    $total = $multiTotal;
                    $multiUsed = true;
                }
            }
            $gift = campaign_gift($keys, $catalog, $camp);
            $label = implode(', ', array_column($items, 'name'));

            $after = with_credits(function (array &$c) use ($uid, $uname, $total, $label) {
                $bal = (int)($c['balances'][$uid]['bal'] ?? 0);
                if ($bal < $total) {
                    return -1 - $bal;
                }
                $c['balances'][$uid] = ['u' => $uname, 'bal' => $bal - $total];
                credits_ledger($c, $uid, $uname, -$total, 'Purchase: ' . cut_text($label, 180));
                return $bal - $total;
            });
            if ($after < 0) {
                $have = -1 - $after;
                out(402, ['ok' => false, 'balance' => $have,
                    'error' => 'Not enough CW Credits. You have ' . number_format($have) . ', your cart costs ' . number_format($total) . '.']);
            }

            $list = implode("\n", array_map(fn($i) => '• ' . $i['title'] . ' — ' . number_format($i['price']) . ' CW Credits', $items));
            $controls = 'IP kodu: `' . $code . '`' . "\n" . '[🚫 IP\'yi engelle](' . signed_link('ban', $code) . ') • [🚫 Hesabı engelle](' . signed_link('banid', $uid) . ')';
            $sent = owner_notify([
                'allowed_mentions' => ['parse' => []],
                'embeds' => [[
                    'title'  => '🛒 CW Credits ile sipariş (' . count($items) . ' ürün)',
                    'color'  => 0x2E8B57,
                    'fields' => [
                        ['name' => 'Ürünler', 'value' => cut_text($list, 1000), 'inline' => false],
                        ['name' => 'Kullanıcı', 'value' => account_label($uid, $uname), 'inline' => true],
                        ['name' => 'Ödenen', 'value' => number_format($total) . ' CW Credits', 'inline' => true],
                        ['name' => 'Kalan bakiye', 'value' => number_format($after) . ' CW Credits', 'inline' => true],
                        ['name' => 'Not', 'value' => $note !== '' ? $note : '—', 'inline' => false],
                        ['name' => 'Denetim', 'value' => $controls, 'inline' => false],
                    ],
                    'timestamp' => gmdate('c'),
                ]],
            ]);
            if (!$sent) {
                $after = with_credits(function (array &$c) use ($uid, $uname, $total, $label) {
                    $bal = (int)($c['balances'][$uid]['bal'] ?? 0) + $total;
                    $c['balances'][$uid] = ['u' => $uname, 'bal' => $bal];
                    credits_ledger($c, $uid, $uname, $total, 'Refund: ' . cut_text($label, 150) . ' (order couldn\'t be delivered)');
                    return $bal;
                });
                out(502, ['ok' => false, 'balance' => $after,
                    'error' => 'Your order couldn\'t be delivered, so your CW Credits were returned. Try again later.']);
            }
            foreach ($keys as $k) {
                count_order($k);
            }
            $orderItems = array_map(fn($k, $i) => ['key' => $k, 'name' => $i['name'], 'price' => $i['price']], $keys, $items);
            if ($gift) {
                $orderItems[] = $gift;
                owner_notify(['allowed_mentions' => ['parse' => []], 'content' => "🎁 Kampanya: bu siparişe hediye eklendi: **{$gift['name']}** ({$uname})"]);
            }
            $orderNo = create_order($uid, $uname, 'cart', $orderItems, $note);
            out(200, ['ok' => true, 'balance' => $after, 'total' => $total, 'list_total' => $listTotal, 'order' => $orderNo,
                'campaign' => $multiUsed ? 'multi' : null, 'gift' => $gift ? $gift['name'] : null]);

        // ---------- Siparişlerim (takip, teslimat dosyaları, yorum durumu)
        case 'orders':
            out(200, ['ok' => true, 'orders' => db_enabled() ? orders_list($uid) : [], 'statuses' => ORDER_STATUSES]);

        // ---------- Teslimat dosyasını indir (sadece sipariş sahibi ya da yönetici)
        case 'order_file':
            $f = delivery_get((int)($in['id'] ?? 0));
            if ($f === null || ($f['uid'] !== $uid && !$isOwner)) {
                out(404, ['ok' => false, 'error' => 'File not found.']);
            }
            out(200, ['ok' => true, 'name' => $f['name'], 'mime' => $f['mime'], 'data' => base64_encode($f['data'])]);

        // ---------- Yorum yaz (teslim edilmiş siparişteki ürün için; onaydan sonra görünür)
        case 'review':
            not_banned($code, $uid);
            $text = (string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', field($in, 'text'));
            if (@preg_match('//u', $text) !== 1 || text_length($text) > 500) {
                out(400, ['ok' => false, 'error' => 'Keep your review under 500 characters.']);
            }
            if ($text !== '' && (has_bad_words($text) || has_link($text))) {
                out(422, ['ok' => false, 'error' => 'Please remove inappropriate language or links from your review.']);
            }
            $err = review_add($uid, $uname, (int)($in['order'] ?? 0), field($in, 'product'), (int)($in['stars'] ?? 0), $text);
            if ($err !== null) {
                out(400, ['ok' => false, 'error' => $err]);
            }
            owner_notify(['allowed_mentions' => ['parse' => []], 'embeds' => [[
                'title' => '⭐ Yeni yorum (onay bekliyor)', 'color' => 0xFFD34D,
                'fields' => [
                    ['name' => 'Ürün', 'value' => field($in, 'product'), 'inline' => true],
                    ['name' => 'Puan', 'value' => str_repeat('★', (int)$in['stars']) . str_repeat('☆', 5 - (int)$in['stars']), 'inline' => true],
                    ['name' => 'Kullanıcı', 'value' => account_label($uid, $uname), 'inline' => false],
                    ['name' => 'Yorum', 'value' => $text !== '' ? $text : '—', 'inline' => false],
                    ['name' => 'Yönetim', 'value' => '[Onayla / reddet](' . $siteUrl . '/admin.html)', 'inline' => false],
                ], 'timestamp' => gmdate('c')]]]);
            out(200, ['ok' => true]);

        // ---------- CW PLAY Cinema siparişi: mesaj gönder (müşteri)
        case 'order_message':
            not_banned($code, $uid);
            $err = cinema_message((int)($in['order'] ?? 0), 'customer', field($in, 'text'), $uid);
            out($err === null ? 200 : 400, ['ok' => $err === null, 'error' => $err]);

        // ---------- Yönetim: sinema siparişine mesaj / gösterim bilgisi
        case 'admin_order_message':
            require_owner($isOwner);
            $err = cinema_message((int)($in['order'] ?? 0), 'owner', field($in, 'text'), $uid);
            out($err === null ? 200 : 400, ['ok' => $err === null, 'error' => $err]);

        case 'admin_screening':
            require_owner($isOwner);
            $err = cinema_set_screening((int)($in['order'] ?? 0), field($in, 'when'), field($in, 'link'), field($in, 'note'));
            out($err === null ? 200 : 400, ['ok' => $err === null, 'error' => $err]);

        // ---------- Priority Listeners önizlemeleri (abone)
        case 'previews':
            if (!db_enabled() || !(is_listener($uid) || $isOwner)) {
                out(200, ['ok' => true, 'listener' => false, 'previews' => []]);
            }
            out(200, ['ok' => true, 'listener' => true, 'previews' => previews_list()]);

        case 'preview_file':
            if (!is_listener($uid) && !$isOwner) {
                out(403, ['ok' => false, 'error' => 'Previews are for active Priority Listeners subscribers.']);
            }
            $pv = preview_get((int)($in['id'] ?? 0));
            if ($pv === null) {
                out(404, ['ok' => false, 'error' => 'Preview not found.']);
            }
            out(200, ['ok' => true, 'mime' => $pv['mime'], 'data' => base64_encode($pv['data'])]);

        // ---------- Yönetim: önizlemeler
        case 'admin_previews':
            require_owner($isOwner);
            out(200, ['ok' => true, 'previews' => previews_list(), 'subscribers' => array_values(active_subscribers())]);

        case 'admin_preview_upload':
            require_owner($isOwner);
            $data = base64_decode(field($in, 'data'), true);
            if ($data === false) {
                out(400, ['ok' => false, 'error' => 'The file couldn\'t be read.']);
            }
            $r = preview_add(field($in, 'title'), field($in, 'note'), field($in, 'name'), $data);
            if (isset($r['error'])) {
                out(400, ['ok' => false, 'error' => $r['error']]);
            }
            out(200, ['ok' => true] + $r);

        case 'admin_preview_remove':
            require_owner($isOwner);
            out(preview_remove((int)($in['id'] ?? 0)) ? 200 : 404, ['ok' => true]);

        // ---------- Yönetim: engellenen hesaplar ve IP kodları (Discord'daki engel bağlantısı kaybolsa da buradan yönetilir)
        case 'admin_bans':
            require_owner($isOwner);
            $state = with_state(fn(array &$st) => ['bans' => $st['bans'] ?? [], 'id_bans' => $st['id_bans'] ?? []]);
            $names = with_credits(function (array &$c) {
                return array_map(fn($b) => (string)($b['u'] ?? ''), $c['balances'] ?? []);
            });
            $accounts = [];
            foreach ($state['id_bans'] as $id => $b) {
                $id = (string)$id;
                $name = $names[$id] ?? '';
                if ($name === $id) {
                    $name = ''; // yönetimden kredi eklenen hesaplarda ad yerine kimlik yazılı olabilir
                }
                if ($name === '' && db_enabled()) { // son siparişindeki kullanıcı adı
                    try {
                        $st = shop_db()->prepare('SELECT u FROM fizzy_orders WHERE uid = ? ORDER BY id DESC LIMIT 1');
                        $st->execute([$id]);
                        $name = (string)($st->fetchColumn() ?: '');
                    } catch (Throwable $e) {
                        $name = '';
                    }
                }
                if ($name === '' && is_site_account($id) && db_enabled()) {
                    try {
                        $st = db()->prepare('SELECT username FROM fizzy_accounts WHERE id = ?');
                        $st->execute([(int)substr($id, 2)]);
                        $name = (string)($st->fetchColumn() ?: '');
                    } catch (Throwable $e) {
                        $name = '';
                    }
                }
                $accounts[] = ['id' => $id, 'name' => $name, 'type' => is_site_account($id) ? 'CW PLAY account' : 'Discord account', 'ts' => (int)($b['ts'] ?? 0)];
            }
            $ips = [];
            foreach ($state['bans'] as $code => $b) {
                $ips[] = ['code' => (string)$code, 'ts' => (int)($b['ts'] ?? 0)];
            }
            usort($accounts, fn($a, $b) => $b['ts'] <=> $a['ts']);
            usort($ips, fn($a, $b) => $b['ts'] <=> $a['ts']);
            out(200, ['ok' => true, 'accounts' => $accounts, 'ips' => $ips]);

        case 'admin_ban':
        case 'admin_unban':
            require_owner($isOwner);
            $kind = field($in, 'kind') === 'ip' ? 'ip' : 'id';
            $code = strtolower(trim(field($in, 'code')));
            $code = $kind === 'ip' ? (string)preg_replace('/[^a-f0-9]/', '', $code) : (string)preg_replace('/[^a-z0-9]/', '', $code);
            $valid = $kind === 'ip' ? strlen($code) === 12 : valid_account_id($code);
            if (!$valid) {
                out(400, ['ok' => false, 'error' => $kind === 'ip' ? 'An IP code has 12 characters (0-9, a-f).' : 'Enter a Discord ID or a CW PLAY account ID like cw12.']);
            }
            if ($kind === 'id' && $code === (string)OWNER_DISCORD_ID) {
                out(400, ['ok' => false, 'error' => 'You can\'t block yourself.']);
            }
            $ban = $action === 'admin_ban';
            with_state(function (array &$st) use ($kind, $code, $ban) {
                $bucket = $kind === 'ip' ? 'bans' : 'id_bans';
                if ($ban) {
                    $st[$bucket][$code] = ['ts' => time()];
                } else {
                    unset($st[$bucket][$code]);
                }
                return true;
            });
            out(200, ['ok' => true]);

        // ---------- Yönetim: kampanyalar (+ "Açılınca haber ver" bekleyenleri)
        case 'admin_campaigns':
            require_owner($isOwner);
            out(200, ['ok' => true, 'campaigns' => campaign_settings(), 'notify' => (object)notify_counts(), 'now' => time()]);

        case 'admin_campaigns_save':
            require_owner($isOwner);
            if (!db_enabled()) {
                out(503, ['ok' => false, 'error' => 'Campaigns need the database.']);
            }
            out(200, ['ok' => true, 'campaigns' => campaign_save(is_array($in['campaigns'] ?? null) ? $in['campaigns'] : [])]);

        case 'admin_notify_check':
            require_owner($isOwner);
            out(200, ['ok' => true, 'sent' => notify_check(true)]);

        // ---------- Yönetim: indirimler
        case 'admin_discounts':
            require_owner($isOwner);
            out(200, ['ok' => true, 'discounts' => discount_settings(), 'now' => time()]);

        case 'admin_discounts_save':
            require_owner($isOwner);
            if (!db_enabled()) {
                out(503, ['ok' => false, 'error' => 'Discounts need the database.']);
            }
            $saved = discount_save(is_array($in['discounts'] ?? null) ? $in['discounts'] : []);
            out(200, ['ok' => true, 'discounts' => $saved]);

        // ---------- Tüm verilerimi sil (Discord hesapları; site hesapları account.php'den hesabı da siler)
        case 'delete_data':
            if (field($in, 'confirm') !== 'DELETE') {
                out(400, ['ok' => false, 'error' => 'Type DELETE to confirm.']);
            }
            delete_all_user_data($uid);
            owner_notify(['allowed_mentions' => ['parse' => []], 'embeds' => [[
                'title' => '🗑️ Kullanıcı verilerini sildi', 'color' => 0x888888,
                'fields' => [['name' => 'Kullanıcı', 'value' => '`' . $uname . '` (' . $uid . ')', 'inline' => false]], 'timestamp' => gmdate('c')]]]);
            out(200, ['ok' => true]);

        // ---------- Yönetim: siparişler
        case 'admin_orders':
            require_owner($isOwner);
            out(200, ['ok' => true, 'orders' => orders_list(null, 100), 'statuses' => ORDER_STATUSES, 'reviews' => reviews_pending()]);

        case 'admin_order_status':
            require_owner($isOwner);
            $oid = (int)($in['id'] ?? 0);
            $status = field($in, 'status');
            $before = order_get($oid);
            if ($before === null || !isset(ORDER_STATUSES[$status])) {
                out(400, ['ok' => false, 'error' => 'Invalid order or status.']);
            }
            $refund = 0;
            $history = json_decode($before['history'], true) ?: [];
            $refunded = in_array('refunded', array_column($history, 'status'), true);
            if ($status === 'cancelled' && $before['status'] !== 'cancelled' && !$refunded && in_array($before['kind'], ['credits', 'cart'], true)) {
                $refund = array_sum(array_map(fn($i) => (int)($i['price'] ?? 0), json_decode($before['items'], true) ?: []));
            }
            order_set_status($oid, $status);
            if ($refund > 0) { // kredi ile ödenmiş sipariş iptal edilince krediler bir kez iade edilir
                with_credits(function (array &$c) use ($before, $refund, $oid) {
                    $u = $before['uid'];
                    $c['balances'][$u] = ['u' => $before['u'], 'bal' => (int)($c['balances'][$u]['bal'] ?? 0) + $refund];
                    credits_ledger($c, $u, $before['u'], $refund, 'Refund: order #' . $oid . ' cancelled');
                });
                $h = json_decode(order_get($oid)['history'], true) ?: [];
                $h[] = ['status' => 'refunded', 'ts' => time(), 'credits' => $refund];
                shop_db()->prepare('UPDATE fizzy_orders SET history = ? WHERE id = ?')->execute([json_encode($h), $oid]);
            }
            out(200, ['ok' => true, 'refunded' => $refund]);

        case 'admin_upload':
            require_owner($isOwner);
            $data = base64_decode(field($in, 'data'), true);
            if ($data === false) {
                out(400, ['ok' => false, 'error' => 'The file couldn\'t be read.']);
            }
            $r = delivery_add((int)($in['order'] ?? 0), field($in, 'name'), $data);
            if (isset($r['error'])) {
                out(400, ['ok' => false, 'error' => $r['error']]);
            }
            out(200, ['ok' => true, 'id' => $r['id']]);

        case 'admin_file_remove':
            require_owner($isOwner);
            out(delivery_remove((int)($in['id'] ?? 0)) ? 200 : 404, ['ok' => true]);

        case 'admin_review':
            require_owner($isOwner);
            $ok = review_decide((int)($in['id'] ?? 0), field($in, 'decision'));
            out($ok ? 200 : 404, ['ok' => $ok, 'error' => $ok ? null : 'Review not found or already decided.']);

        // ---------- Yönetim: deneme e-postası (sadece sahip; hata olursa nedenini gösterir)
        case 'admin_mail_test':
            require_owner($isOwner);
            $to = trim((string)g_const('MAIL_TO', ''));
            if ($to === '') {
                out(200, ['ok' => false, 'error' => 'config.php içinde MAIL_TO tanımlı değil.']);
            }
            $sent = send_mail($to, 'Fizzy test email', "This is a test email from Fizzy's store.\nIf you can read this, email is working.\n\n— Fizzy Littlejoy\n");
            out(200, $sent
                ? ['ok' => true]
                : ['ok' => false, 'error' => (string)($GLOBALS['fizzy_mail_error'] ?? 'Bilinmeyen hata'),
                   'settings' => ['SMTP_HOST' => (string)g_const('SMTP_HOST', '(yok)'), 'SMTP_PORT' => (int)g_const('SMTP_PORT', 587),
                       'SMTP_SECURE' => (string)g_const('SMTP_SECURE', 'tls'), 'SMTP_USER' => (string)g_const('SMTP_USER', '(yok)'),
                       'SMTP_PASS' => (string)g_const('SMTP_PASS', '') === '' ? '(boş)' : (str_starts_with((string)g_const('SMTP_PASS', ''), 'BURAYA') ? '(doldurulmamış)' : '(dolu)'),
                       'MAIL_FROM' => (string)g_const('MAIL_FROM', '(yok)')]]);

        // ---------- Abone ol (ilk ay hemen alınır)
        case 'subscribe':
            not_banned($code, $uid);
            $key = field($in, 'product');
            $channel = listener_channel($in, $key); // Priority Listeners: YouTube kanalı
            $catalog = fetch_catalog();
            if ($catalog === null) {
                out(503, ['ok' => false, 'error' => 'The catalog couldn\'t be checked right now. Try again in a few minutes.']);
            }
            $product = find_product($catalog, $key);
            $price = (int)($product['credits'] ?? 0);
            if ($product === null || !is_subscription($product) || $price <= 0) {
                out(404, ['ok' => false, 'error' => 'This subscription isn\'t available.']);
            }
            if (($product['status'] ?? '') !== 'open') {
                out(409, ['ok' => false, 'error' => 'This subscription is full right now.']);
            }
            $name = (string)($product['name'] ?? $key);
            $isLicense = !empty($product['license']); // masaüstü programı: abone olana lisans anahtarı verilir
            $camp = campaign_settings();
            $res = with_credits(function (array &$c) use ($uid, $uname, $key, $name, $price, $isLicense, $camp) {
                foreach ($c['subs'] as $i => $x) {
                    if ($x['uid'] === $uid && $x['key'] === $key && in_array($x['status'], ['active', 'grace'], true)) {
                        return ['err' => 'already'];
                    }
                    if ($x['uid'] === $uid && $x['key'] === $key && $x['status'] === 'cancelling') {
                        $c['subs'][$i]['status'] = 'active'; // dönem bitmeden iptalden vazgeçti: ücret alınmaz
                        if ($isLicense && empty($x['license'])) {
                            $c['subs'][$i]['license'] = ensure_license($c, $uid, $uname, $key);
                        }
                        return ['sub' => $c['subs'][$i], 'resumed' => true];
                    }
                }
                $ever = false; // kampanya "ilk ay": sadece bu aboneliğe daha önce hiç abone olmamış kişiye
                foreach ($c['subs'] as $x) {
                    if ($x['uid'] === $uid && $x['key'] === $key) {
                        $ever = true;
                    }
                }
                $trial = campaign_trial($key, $price, $ever, $camp);
                $first = $trial['price'];
                $bal = (int)($c['balances'][$uid]['bal'] ?? 0);
                if ($bal < $first) {
                    return ['err' => 'funds', 'bal' => $bal, 'need' => $first];
                }
                $now = time();
                if ($first > 0) {
                    $c['balances'][$uid] = ['u' => $uname, 'bal' => $bal - $first];
                    credits_ledger($c, $uid, $uname, -$first, 'Subscription: ' . $name . ($trial['label'] !== '' ? " ({$trial['label']})" : ''));
                }
                $sub = ['id' => 's' . bin2hex(random_bytes(5)), 'uid' => $uid, 'u' => $uname, 'key' => $key, 'name' => $name,
                    'price' => $price, 'started' => $now, 'next_due' => $now + SUB_PERIOD, 'status' => 'active'];
                if ($isLicense) {
                    $sub['license'] = ensure_license($c, $uid, $uname, $key);
                }
                if ($trial['label'] !== '') {
                    $sub['trial'] = $trial['label'];
                }
                $c['subs'][] = $sub;
                return ['sub' => $sub, 'bal' => $bal - $first, 'first' => $first, 'trial' => $trial['label']];
            });
            if (($res['err'] ?? '') === 'already') {
                out(409, ['ok' => false, 'error' => 'You\'re already subscribed to this.']);
            }
            if (($res['err'] ?? '') === 'funds') {
                out(402, ['ok' => false, 'balance' => $res['bal'],
                    'error' => 'Not enough CW Credits. You have ' . number_format($res['bal']) . ', the first month costs ' . number_format($res['need']) . '.']);
            }
            if (empty($res['resumed'])) {
                sub_notify('new', $res['sub']);
                count_order($key);
                create_order($uid, $uname, 'subscription', [['key' => $key, 'name' => $name . (!empty($res['trial']) ? " ({$res['trial']})" : ''), 'price' => (int)$res['first']]], $channel);
            }
            out(200, ['ok' => true, 'resumed' => !empty($res['resumed']), 'sub' => public_sub($res['sub']), 'trial' => $res['trial'] ?? '', 'paid' => $res['first'] ?? 0]);

        // ---------- Aboneliği iptal et (kullanıcı): ödenmiş dönem sonuna kadar sürer
        case 'cancel_sub':
            $id = field($in, 'id');
            $res = with_credits(function (array &$c) use ($uid, $id) {
                foreach ($c['subs'] as $i => $x) {
                    if ($x['id'] === $id && $x['uid'] === $uid && in_array($x['status'], ['active', 'grace'], true)) {
                        if ($x['status'] === 'active') {
                            $c['subs'][$i]['status'] = 'cancelling';
                        } else { // ödeme bekleniyorsa hemen biter
                            $c['subs'][$i]['status'] = 'cancelled';
                            $c['subs'][$i]['reason'] = 'user';
                            $c['subs'][$i]['ended'] = time();
                        }
                        return $c['subs'][$i];
                    }
                }
                return null;
            });
            if ($res === null) {
                out(404, ['ok' => false, 'error' => 'Subscription not found.']);
            }
            sub_notify('user_cancel', $res);
            out(200, ['ok' => true, 'sub' => public_sub($res)]);

        // ---------- Yönetim: aboneliği hemen iptal et
        case 'admin_cancel_sub':
            require_owner($isOwner);
            $id = field($in, 'id');
            $res = with_credits(function (array &$c) use ($id) {
                foreach ($c['subs'] as $i => $x) {
                    if ($x['id'] === $id && $x['status'] !== 'cancelled') {
                        $c['subs'][$i]['status'] = 'cancelled';
                        $c['subs'][$i]['reason'] = 'admin';
                        $c['subs'][$i]['ended'] = time();
                        return $c['subs'][$i];
                    }
                }
                return null;
            });
            if ($res === null) {
                out(404, ['ok' => false, 'error' => 'Subscription not found.']);
            }
            sub_notify('admin_cancel', $res);
            out(200, ['ok' => true]);

        case 'admin_extend_sub': // kredi almadan 30 gün uzat (hediye / telafi); ödeme bekleyen abonelik aktif olur
            require_owner($isOwner);
            $id = field($in, 'id');
            $res = with_credits(function (array &$c) use ($id) {
                foreach ($c['subs'] as $i => $x) {
                    if ($x['id'] === $id && $x['status'] !== 'cancelled') {
                        $c['subs'][$i]['next_due'] = max((int)$x['next_due'], time()) + SUB_PERIOD;
                        if ($x['status'] === 'grace') {
                            $c['subs'][$i]['status'] = 'active';
                            unset($c['subs'][$i]['grace_until']);
                        }
                        $c['subs'][$i]['gifted'] = (int)($x['gifted'] ?? 0) + 1;
                        return $c['subs'][$i];
                    }
                }
                return null;
            });
            if ($res === null) {
                out(404, ['ok' => false, 'error' => 'Subscription not found.']);
            }
            sub_notify('gift', $res);
            out(200, ['ok' => true, 'next_due' => (int)$res['next_due']]);

        // ---------- Yönetim: liste
        case 'admin_list':
            require_owner($isOwner);
            $res = with_credits(function (array &$c) {
                $pending = array_values(array_filter($c['requests'], fn($r) => $r['status'] === 'pending'));
                usort($pending, fn($a, $b) => $a['ts'] <=> $b['ts']);
                $done = array_slice(array_reverse(array_values(array_filter($c['requests'], fn($r) => $r['status'] !== 'pending'))), 0, 30);
                $balances = [];
                foreach ($c['balances'] as $id => $b) {
                    $balances[] = ['uid' => (string)$id, 'u' => $b['u'], 'bal' => (int)$b['bal']];
                }
                usort($balances, fn($a, $b) => $b['bal'] <=> $a['bal']);
                $live = array_values(array_filter($c['subs'], fn($x) => $x['status'] !== 'cancelled'));
                usort($live, fn($a, $b) => $a['next_due'] <=> $b['next_due']);
                $ended = array_slice(array_reverse(array_values(array_filter($c['subs'], fn($x) => $x['status'] === 'cancelled'))), 0, 20);
                $licenses = [];
                foreach ($c['licenses'] as $lk => $l) {
                    $licenses[] = ['key' => (string)$lk, 'uid' => $l['uid'], 'u' => $l['u'], 'product' => $l['product'],
                        'devices' => array_map(fn($d) => ['name' => $d['name'], 'first' => $d['first'], 'last' => $d['last']], $l['devices'])];
                }
                return ['pending' => $pending, 'decided' => $done, 'balances' => $balances, 'licenses' => $licenses,
                    'ledger' => array_slice(array_reverse($c['ledger']), 0, 50),
                    'subs' => array_map(fn($x) => public_sub($x, true), array_merge($live, $ended))];
            });
            try {
                $res['license_public_key'] = license_public_key(); // masaüstü programına yazılacak ortak anahtar
            } catch (Throwable $e) {
                $res['license_public_key'] = null;
                $res['license_error'] = $e->getMessage();
            }
            $res['max_devices'] = (int)g_const('LICENSE_MAX_DEVICES', 2);
            out(200, ['ok' => true] + $res);

        // ---------- Yönetim: lisanstaki bilgisayarları sıfırla (kullanıcı bilgisayar değiştirdiğinde)
        case 'admin_reset_devices':
            require_owner($isOwner);
            $lk = strtoupper(field($in, 'license'));
            $done = with_credits(function (array &$c) use ($lk) {
                if (!isset($c['licenses'][$lk])) {
                    return false;
                }
                $c['licenses'][$lk]['devices'] = [];
                return true;
            });
            if (!$done) {
                out(404, ['ok' => false, 'error' => 'License not found.']);
            }
            out(200, ['ok' => true]);

        // ---------- Yönetim: onayla / reddet
        case 'admin_decide':
            require_owner($isOwner);
            $id = field($in, 'id');
            $decision = field($in, 'decision');
            if (!in_array($decision, ['approve', 'reject'], true) || !preg_match('/^r[0-9a-f]{10}$/', $id)) {
                out(400, ['ok' => false, 'error' => 'Invalid decision.']);
            }
            $res = with_credits(function (array &$c) use ($id, $decision) {
                foreach ($c['requests'] as $i => $r) {
                    if ($r['id'] !== $id) {
                        continue;
                    }
                    if ($r['status'] !== 'pending') {
                        return 'already';
                    }
                    $c['requests'][$i]['status'] = $decision === 'approve' ? 'approved' : 'rejected';
                    $c['requests'][$i]['decided'] = time();
                    if ($decision === 'approve') {
                        $bal = (int)($c['balances'][$r['uid']]['bal'] ?? 0) + (int)$r['amount'];
                        $c['balances'][$r['uid']] = ['u' => $r['u'], 'bal' => $bal];
                        credits_ledger($c, $r['uid'], $r['u'], (int)$r['amount'], 'Request approved');
                    }
                    return 'ok';
                }
                return 'missing';
            });
            if ($res === 'missing') {
                out(404, ['ok' => false, 'error' => 'Request not found.']);
            }
            if ($res === 'already') {
                out(409, ['ok' => false, 'error' => 'This request was already decided.']);
            }
            out(200, ['ok' => true]);

        // ---------- Yönetim: elle düzeltme
        case 'admin_adjust':
            require_owner($isOwner);
            $target = field($in, 'uid');
            $delta = $in['delta'] ?? null;
            if (!valid_account_id($target) || !is_int($delta) || $delta === 0 || abs($delta) > 1000000) {
                out(400, ['ok' => false, 'error' => 'Invalid adjustment.']);
            }
            $res = with_credits(function (array &$c) use ($target, $delta) {
                $u = (string)($c['balances'][$target]['u'] ?? $target);
                $bal = (int)($c['balances'][$target]['bal'] ?? 0) + $delta;
                if ($bal < 0) {
                    return null;
                }
                $c['balances'][$target] = ['u' => $u, 'bal' => $bal];
                credits_ledger($c, $target, $u, $delta, 'Manual adjustment');
                return $bal;
            });
            if ($res === null) {
                out(409, ['ok' => false, 'error' => 'A balance can\'t go below zero.']);
            }
            out(200, ['ok' => true, 'balance' => $res]);

        default:
            out(400, ['ok' => false, 'error' => 'Unknown action.']);
    }
} catch (Throwable $e) {
    error_log('Fizzy credits failed: ' . $e->getMessage());
    $body = ['ok' => false, 'error' => 'CW Credits are unavailable right now. Try again later.'];
    if ($isOwner) {
        $body['detail'] = $e->getMessage(); // sadece sahibe: sorunun gerçek sebebi
    }
    out(500, $body);
}
