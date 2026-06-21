import { ensureTable, getEntity, queryEntities, upsertEntity } from './tableStorage';
import { normalizeEmail, normalizePhone, phoneRowKey } from './identifiers';

const CUSTOMERS = 'customers';
const PHONE_INDEX = 'customerPhoneIndex';

export interface CustomerEntity {
  partitionKey: 'customer';
  rowKey: string;            // lowercase email = canonical user id
  email: string;
  passwordHash?: string;
  name: string;
  mobile?: string;           // canonical E.164 form
  picture?: string;
  provider: 'email' | 'google' | 'email+google';
  googleSub?: string;
  createdAt: string;
  lastLoginAt?: string;
  // Bumped on logout / password change. The JWT carries a matching `ver`
  // claim; verifyCustomerClaims rejects tokens whose `ver` is behind. This
  // is the revocation lever — a single integer change invalidates every
  // outstanding token for that user. Default 0 if missing on legacy rows.
  tokenVersion?: number;
}

interface PhoneIndexEntity {
  partitionKey: 'phone';
  rowKey: string;            // digits-only phone
  email: string;             // points to customers rowKey
  updatedAt: string;
}

async function ensureTables(): Promise<void> {
  await Promise.all([ensureTable(CUSTOMERS), ensureTable(PHONE_INDEX)]);
}

export async function findCustomerByEmail(emailRaw: string): Promise<CustomerEntity | null> {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  await ensureTables();
  return getEntity<CustomerEntity>(CUSTOMERS, 'customer', email);
}

export async function findCustomerByPhone(phoneRaw: string): Promise<CustomerEntity | null> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  await ensureTables();
  const idx = await getEntity<PhoneIndexEntity>(PHONE_INDEX, 'phone', phoneRowKey(phone));
  if (!idx) return null;
  return getEntity<CustomerEntity>(CUSTOMERS, 'customer', normalizeEmail(idx.email));
}

export async function findCustomerByEmailOrPhone(identifier: string): Promise<CustomerEntity | null> {
  if (!identifier) return null;
  if (identifier.includes('@')) return findCustomerByEmail(identifier);
  return findCustomerByPhone(identifier);
}

async function indexPhone(email: string, phoneE164: string): Promise<void> {
  await ensureTable(PHONE_INDEX);
  const entity: PhoneIndexEntity = {
    partitionKey: 'phone',
    rowKey: phoneRowKey(phoneE164),
    email: normalizeEmail(email),
    updatedAt: new Date().toISOString(),
  };
  await upsertEntity(PHONE_INDEX, entity);
}

export async function saveCustomer(customer: CustomerEntity): Promise<void> {
  await ensureTables();
  await upsertEntity(CUSTOMERS, customer);
  if (customer.mobile) {
    await indexPhone(customer.email, customer.mobile);
  }
}

export interface UpsertInput {
  email: string;
  name: string;
  mobile?: string;
  picture?: string;
  passwordHash?: string;
  provider: 'email' | 'google';
  googleSub?: string;
}

export interface UpsertResult {
  customer: CustomerEntity;
  created: boolean;
  mergedWith?: 'email' | 'phone';
}

// Atomically creates a customer or merges/updates an existing one matched by
// email or phone. The first hit wins; phone match only kicks in when email
// doesn't already resolve.
export async function upsertCustomer(input: UpsertInput): Promise<UpsertResult> {
  await ensureTables();
  const email = normalizeEmail(input.email);
  const phone = input.mobile ? normalizePhone(input.mobile) : undefined;

  let existing = email ? await findCustomerByEmail(email) : null;
  let mergedWith: 'email' | 'phone' | undefined = existing ? 'email' : undefined;

  if (!existing && phone) {
    existing = await findCustomerByPhone(phone);
    if (existing) mergedWith = 'phone';
  }

  const now = new Date().toISOString();

  if (existing) {
    const merged: CustomerEntity = {
      ...existing,
      name: existing.name || input.name,
      mobile: existing.mobile || phone,
      picture: input.picture ?? existing.picture,
      provider:
        existing.provider === input.provider
          ? existing.provider
          : (existing.provider === 'email' && input.provider === 'google') ||
            (existing.provider === 'google' && input.provider === 'email')
            ? 'email+google'
            : existing.provider,
      googleSub: input.googleSub ?? existing.googleSub,
      passwordHash: input.passwordHash ?? existing.passwordHash,
      lastLoginAt: now,
    };
    await upsertEntity(CUSTOMERS, merged);
    if (merged.mobile) await indexPhone(merged.email, merged.mobile);
    return { customer: merged, created: false, mergedWith };
  }

  const created: CustomerEntity = {
    partitionKey: 'customer',
    rowKey: email,
    email,
    name: input.name,
    mobile: phone,
    picture: input.picture,
    passwordHash: input.passwordHash,
    provider: input.provider,
    googleSub: input.googleSub,
    createdAt: now,
    lastLoginAt: now,
  };
  await upsertEntity(CUSTOMERS, created);
  if (created.mobile) await indexPhone(created.email, created.mobile);
  return { customer: created, created: true };
}

export async function updateLastLogin(email: string): Promise<void> {
  const c = await findCustomerByEmail(email);
  if (!c) return;
  await upsertEntity(CUSTOMERS, { ...c, lastLoginAt: new Date().toISOString() });
}

export async function setPasswordHash(email: string, passwordHash: string): Promise<void> {
  const c = await findCustomerByEmail(email);
  if (!c) throw new Error('Customer not found');
  // Password change invalidates all outstanding sessions: same lever as
  // logout, but the operator/user has clearly intended to revoke.
  const nextVersion = (c.tokenVersion ?? 0) + 1;
  await upsertEntity(CUSTOMERS, { ...c, passwordHash, tokenVersion: nextVersion });
}

/**
 * Increment the customer's `tokenVersion`, which invalidates every JWT
 * outstanding for that account. Used by /api/auth/logout. Returns the new
 * version, or null if the customer no longer exists.
 */
export async function bumpCustomerTokenVersion(email: string): Promise<number | null> {
  const c = await findCustomerByEmail(email);
  if (!c) return null;
  const nextVersion = (c.tokenVersion ?? 0) + 1;
  await upsertEntity(CUSTOMERS, { ...c, tokenVersion: nextVersion });
  return nextVersion;
}

// Useful in tests; not used by any handler.
export async function listCustomers(): Promise<CustomerEntity[]> {
  await ensureTable(CUSTOMERS);
  return queryEntities<CustomerEntity>(CUSTOMERS, `PartitionKey eq 'customer'`);
}
