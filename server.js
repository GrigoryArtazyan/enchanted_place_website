/**
 * Enchanted Place — Express server
 *
 * Serves the static site, Stripe Checkout, letter/form inbox (data/messages.json),
 * and a password-protected /admin view. Configure via .env (see .env.example).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Stripe from 'stripe';

const root = dirname(fileURLToPath(import.meta.url));
const ordersPath = join(root, 'data', 'orders.json');
const messagesPath = join(root, 'data', 'messages.json');
const adminPagePath = join(root, 'admin.html');

loadEnv(join(root, '.env'));

const port = Number(process.env.PORT || 4242);
const secretKey = process.env.STRIPE_SECRET_KEY || '';
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminCookie = 'ep_admin';
const adminTtlMs = 1000 * 60 * 60 * 24 * 14; // 14 days

const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: '2026-08-26.preview' })
  : null;

const app = express();
app.disable('x-powered-by');

// --- Stripe webhooks (raw body required for signature check) ---
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !webhookSecret) {
    res.status(503).send('Webhook secret is not configured');
    return;
  }

  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    res.status(400).send(`Webhook signature verification failed: ${error.message}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') fulfillOrder(session);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      recordOrder(session.id, { status: 'failed', payment_status: session.payment_status });
    }
    res.json({ received: true });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.use(express.json());

// Block direct URL access to data/*.json (static would otherwise serve them).
app.use('/data', (_req, res) => {
  res.status(404).end();
});

// --- Admin inbox (ADMIN_PASSWORD in .env) ---
app.get('/admin', (_req, res) => {
  res.sendFile(adminPagePath);
});

app.post('/api/admin/login', (req, res) => {
  if (!adminPassword) {
    res.status(503).json({ error: 'Add ADMIN_PASSWORD to .env, then restart the server.' });
    return;
  }
  const password = String(req.body?.password || '');
  if (!safeEq(password, adminPassword)) {
    res.status(401).json({ error: 'Wrong password.' });
    return;
  }
  res.setHeader('Set-Cookie', adminSessionCookie(makeAdminToken()));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${adminCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/admin/messages', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const messages = readJsonArray(messagesPath).slice().reverse();
  const letters = messages.filter((row) => row.kind === 'letter');
  res.json({ messages, letters, counts: { all: messages.length, letters: letters.length } });
});

app.use(express.static(root, { dotfiles: 'ignore', index: 'index.html' }));

// Publishable key for the browser; secrets never leave the server.
app.get('/api/config', (_req, res) => {
  res.json({
    publishableKey: publishableKey || null,
    configured: Boolean(stripe && publishableKey),
  });
});

// Fields accepted per form kind (letter signup, about forms, booking notes).
const messageFields = {
  letter: ['email'],
  inquire: ['name', 'email', 'note'],
  guide: ['name', 'email', 'practice', 'languages', 'place'],
  host: ['name', 'email', 'experience', 'organization', 'who', 'size', 'timing', 'note'],
  booking: ['name', 'email', 'experience', 'date', 'size', 'rate', 'note'],
};

app.post('/api/messages', (req, res) => {
  const kind = String(req.body?.kind || '');
  const fields = messageFields[kind];
  if (!fields) {
    res.status(400).json({ error: 'Unknown message.' });
    return;
  }

  const record = { kind, at: new Date().toISOString() };
  for (const key of fields) {
    record[key] = String(req.body?.[key] || '').trim().slice(0, 2000);
  }
  if (!isEmail(record.email)) {
    res.status(400).json({ error: 'Enter a full email address, like name@example.com' });
    return;
  }
  if (kind !== 'letter' && !record.name) {
    res.status(400).json({ error: 'Please add your name.' });
    return;
  }

  const messages = readJsonArray(messagesPath);
  messages.push(record);
  mkdirSync(dirname(messagesPath), { recursive: true });
  writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  res.json({ ok: true });
});

// --- Stripe Connect (seller onboarding) ---
app.post('/api/sellers', async (req, res) => {
  if (!requireStripe(res)) return;
  const email = String(req.body?.email || '').trim();
  const displayName = String(req.body?.displayName || '').trim();
  if (!isEmail(email) || !displayName) {
    res.status(400).json({ error: 'Enter a seller name and a valid email.' });
    return;
  }

  try {
    const platform = await stripe.accounts.retrieve();
    const account = await stripe.v2.core.accounts.create({
      contact_email: email,
      display_name: displayName,
      dashboard: 'express',
      identity: { country: String(platform.country || 'US').toLowerCase() },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      include: ['configuration.recipient', 'identity', 'requirements'],
    });
    res.json(publicSeller(account));
  } catch (error) {
    sendStripeError(res, error);
  }
});

app.get('/api/sellers/:id', async (req, res) => {
  if (!requireStripe(res)) return;
  if (!isAccountId(req.params.id)) {
    res.status(400).json({ error: 'Invalid connected account id.' });
    return;
  }
  try {
    const account = await stripe.v2.core.accounts.retrieve(req.params.id, {
      include: ['configuration.recipient'],
    });
    res.json(publicSeller(account));
  } catch (error) {
    sendStripeError(res, error);
  }
});

app.post('/api/account-session', async (req, res) => {
  if (!requireStripe(res)) return;
  const accountId = String(req.body?.accountId || '');
  if (!isAccountId(accountId)) {
    res.status(400).json({ error: 'Invalid connected account id.' });
    return;
  }
  try {
    const session = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
        notification_banner: { enabled: true },
      },
    });
    res.json({ client_secret: session.client_secret });
  } catch (error) {
    sendStripeError(res, error);
  }
});

app.post('/api/express-login', async (req, res) => {
  if (!requireStripe(res)) return;
  const accountId = String(req.body?.accountId || '');
  if (!isAccountId(accountId)) {
    res.status(400).json({ error: 'Invalid connected account id.' });
    return;
  }
  try {
    const link = await stripe.accounts.createLoginLink(accountId);
    res.json({ url: link.url });
  } catch (error) {
    sendStripeError(res, error);
  }
});

// --- Checkout (CAD, destination charge to connected seller) ---
app.post('/api/checkout', async (req, res) => {
  const accountId = String(req.body?.accountId || '');
  if (!isAccountId(accountId)) {
    res.status(400).json({ error: 'Choose a seller before paying.' });
    return;
  }
  const price = bookingPrice(req.body?.experience, req.body?.size, req.body?.rate);
  if (!price) {
    res.status(400).json({ error: 'That group size or price is not offered for this experience.' });
    return;
  }
  if (!requireStripe(res)) return;

  try {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ['configuration.recipient'],
    });
    if (transfersStatus(account) !== 'active') {
      res.status(409).json({
        error: 'This seller cannot receive payouts yet. Finish onboarding first.',
        transfersStatus: transfersStatus(account),
      });
      return;
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const email = String(req.body?.email || '').trim();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: price.quantity,
        price_data: {
          currency: 'cad',
          unit_amount: price.unitAmount,
          product_data: { name: price.name },
        },
      }],
      // Platform fee comes from the Dashboard Platform Pricing Tool.
      // Do not set application_fee_amount here; it overrides that tool.
      payment_intent_data: {
        transfer_data: { destination: accountId },
      },
      ...(isEmail(email) ? { customer_email: email } : {}),
      integration_identifier: 'enchanted_place_web',
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#/`,
      cancel_url: `${origin}/#/`,
      metadata: {
        connected_account: accountId,
        experience: price.experience,
        size: String(price.quantity),
        currency: 'cad',
      },
    });
    res.json({
      url: session.url,
      amount: price.quantity * price.unitAmount,
      currency: 'cad',
    });
  } catch (error) {
    sendStripeError(res, error);
  }
});

app.get('/api/checkout/session/:id', async (req, res) => {
  if (!requireStripe(res)) return;
  if (!req.params.id.startsWith('cs_')) {
    res.status(400).json({ error: 'Invalid Checkout Session id.' });
    return;
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    res.json({
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
    });
  } catch (error) {
    sendStripeError(res, error);
  }
});

const server = createServer(app);
server.listen(port, () => {
  console.log(`Enchanted Place listening on http://localhost:${port}`);
  if (!stripe || !publishableKey) {
    console.log('Stripe keys are not set. Copy .env.example to .env and add sandbox keys.');
  }
  if (!adminPassword) {
    console.log('ADMIN_PASSWORD is not set. /admin login will stay closed until you add it to .env.');
  }
});

function requireAdmin(req, res) {
  if (!adminPassword) {
    res.status(503).json({ error: 'Add ADMIN_PASSWORD to .env, then restart the server.' });
    return false;
  }
  const token = readCookie(req, adminCookie);
  if (!token || !verifyAdminToken(token)) {
    res.status(401).json({ error: 'Sign in required.' });
    return false;
  }
  return true;
}

function makeAdminToken() {
  const exp = String(Date.now() + adminTtlMs);
  return `${exp}.${signAdmin(exp)}`;
}

function verifyAdminToken(token) {
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEq(sig, signAdmin(exp));
}

function signAdmin(exp) {
  return createHmac('sha256', adminPassword).update(`admin:${exp}`).digest('hex');
}

function adminSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${adminCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(adminTtlMs / 1000)}${secure}`;
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return '';
}

function safeEq(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requireStripe(res) {
  if (!stripe || !publishableKey) {
    res.status(503).json({
      error: 'Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to .env, then restart the server.',
    });
    return false;
  }
  return true;
}

function publicSeller(account) {
  return {
    id: account.id,
    displayName: account.display_name || '',
    email: account.contact_email || '',
    transfersStatus: transfersStatus(account),
  };
}

// Keep in sync with EXP rates in site.js (amounts are cents CAD).
const OFFERS = {
  family: { name: 'Enchanted Place family session', minSize: 3, maxSize: 5, unitAmount: 6500 },
  team: { name: 'Enchanted Place team session', minSize: 15, maxSize: 20, unitAmount: 4000 },
  community: { name: 'Enchanted Place community session', minSize: 15, maxSize: 20, unitAmount: 2000 },
};

function bookingPrice(experience, size, rate) {
  const offer = OFFERS[String(experience || '')];
  const people = Number(size);
  if (!offer || !Number.isInteger(people) || people < offer.minSize || people > offer.maxSize) return null;
  let unitAmount = offer.unitAmount;
  if (offer.rate) {
    const chosen = Number(rate);
    if (!Number.isInteger(chosen) || chosen < offer.rate[0] || chosen > offer.rate[1]) return null;
    unitAmount = chosen * 100;
  }
  return { experience: String(experience), name: offer.name, quantity: people, unitAmount };
}

function transfersStatus(account) {
  return account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || 'pending';
}

function isAccountId(value) {
  return /^acct_[A-Za-z0-9]+$/.test(value);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sendStripeError(res, error) {
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 502;
  res.status(status).json({ error: error.message || 'Stripe request failed' });
}

function fulfillOrder(session) {
  recordOrder(session.id, {
    status: 'fulfilled',
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
    connected_account: session.metadata?.connected_account || null,
  });
}

function recordOrder(id, fields) {
  const orders = readOrders();
  orders[id] = { ...orders[id], ...fields, updatedAt: new Date().toISOString() };
  mkdirSync(dirname(ordersPath), { recursive: true });
  writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

function readOrders() {
  if (!existsSync(ordersPath)) return {};
  try {
    return JSON.parse(readFileSync(ordersPath, 'utf8'));
  } catch {
    return {};
  }
}

function readJsonArray(path) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Minimal .env loader (KEY=value). Does not override existing process.env. */
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
