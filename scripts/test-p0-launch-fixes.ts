// ============================================================================
// P0 launch-fix offline regression suite.
// These tests exercise extracted authorization/guard helpers and an in-memory
// D1 double. They do not create users, send messages, or initiate payments.
// ============================================================================

import { readFileSync } from 'node:fs';
import {
  isAuthorizedProposalDelivery,
  resolveProposalDeliveryRecipient,
} from '../functions/api/proposals/[id]/delivery';
import {
  websitePublishLimitAllows,
} from '../functions/api/_tenantAccess';
import {
  releaseReservedStock,
  reservationLines,
  stockIsSufficient,
} from '../functions/api/_stockReservation';
import { customerCancelAllowed } from '../functions/api/customer/orders/[id]';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

const user = {
  id: 'user-1',
  authSubject: 'auth-1',
  email: 'customer@example.com',
  fullName: 'Test Customer',
  supabaseRole: 'customer',
  platformRole: 'end_customer',
  isSuperAdmin: false,
  isPlatformStaff: false,
  staffPermissions: [],
  status: 'active',
} as any;

const admin = { ...user, id: 'admin-1', authSubject: 'admin-1', isSuperAdmin: true } as any;
const proposal = {
  id: 42,
  owner_id: 'user-1',
  secure_token: 'tok_abcdefghijklmnopqrstuvwxyz',
  customer_email: 'customer@example.com',
  customer_phone: '+91 98765 43210',
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  proposal_number: 'PP-42',
  updated_at: '2026-01-01 00:00:00',
};

check('P0-2 owner can deliver own proposal', isAuthorizedProposalDelivery(proposal, user));
check('P0-2 super-admin can deliver proposal', isAuthorizedProposalDelivery(proposal, admin));
check(
  'P0-2 valid secure token authorizes delivery',
  isAuthorizedProposalDelivery({ ...proposal, owner_id: 'other-user' }, user, proposal.secure_token)
);
check(
  'P0-2 guessed proposal ID is rejected',
  !isAuthorizedProposalDelivery({ ...proposal, owner_id: 'other-user' }, user)
);
check(
  'P0-2 expired secure token is rejected',
  !isAuthorizedProposalDelivery(
    { ...proposal, owner_id: 'other-user', expires_at: '2020-01-01T00:00:00Z' },
    user,
    proposal.secure_token
  )
);
check(
  'P0-2 arbitrary recipient rejected for owner',
  resolveProposalDeliveryRecipient(proposal, 'email', 'attacker@example.com', user) === ''
);
check(
  'P0-2 matching custom recipient accepted for owner',
  resolveProposalDeliveryRecipient(proposal, 'email', ' CUSTOMER@EXAMPLE.COM ', user) ===
    proposal.customer_email
);
check(
  'P0-2 super-admin explicit custom recipient accepted',
  resolveProposalDeliveryRecipient(proposal, 'email', 'support@example.com', admin) ===
    'support@example.com'
);
check(
  'P0-2 arbitrary phone recipient rejected for owner',
  resolveProposalDeliveryRecipient(proposal, 'whatsapp', '9000000000', user) === ''
);

check('P0-3 one website within limit', websitePublishLimitAllows(0, 1, false));
check('P0-3 second website blocked on one-site plan', !websitePublishLimitAllows(1, 1, false));
check('P0-3 already-published website can be updated', websitePublishLimitAllows(5, 1, true));
check('P0-3 three-site plan allows third site', websitePublishLimitAllows(2, 3, false));

const lines = reservationLines([
  { productId: 999999, quantity: 1 },
  { productId: 10, quantity: 2 },
  { productId: 20, quantity: 0 },
]);
check('P0-4 sandbox and zero-quantity lines are not reserved', lines.length === 1 && lines[0].productId === 10);
check(
  'P0-4 insufficient multi-item stock is rejected before reservation',
  !stockIsSufficient(
    [
      { id: 10, stock_qty: 5 },
      { id: 20, stock_qty: 1 },
    ],
    [
      { productId: 10, quantity: 2 },
      { productId: 20, quantity: 3 },
    ]
  )
);
check(
  'P0-4 sufficient multi-item stock is accepted',
  stockIsSufficient(
    [
      { id: 10, stock_qty: 5 },
      { id: 20, stock_qty: 3 },
    ],
    [
      { productId: 10, quantity: 2 },
      { productId: 20, quantity: 3 },
    ]
  )
);

interface QueryableStatement {
  bind: (...args: any[]) => QueryableStatement;
  first: () => Promise<any>;
  run: () => Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
}
interface FakeD1 {
  prepare: (sql: string) => QueryableStatement;
  batch: (statements: QueryableStatement[]) => Promise<unknown[]>;
}

function makeFakeD1(websiteId: string, productId: number) {
  const state = {
    stock: 5,
    movements: [] as Array<{ product_id: number; reference_note: string }>,
  };
  const db: FakeD1 = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt: QueryableStatement = {
        bind(...bindArgs: any[]) {
          args = bindArgs;
          return stmt;
        },
        async first() {
          if (sql.includes('SELECT id FROM stock_movements')) {
            const found = state.movements.find(
              (m) => m.product_id === args[1] && m.reference_note === args[2]
            );
            return found ? { id: 1 } : null;
          }
          return null;
        },
        async run() {
          if (sql.includes('UPDATE store_products')) {
            if (args[1] !== productId || args[2] !== websiteId) throw new Error('unexpected bind');
            state.stock += Number(args[0]);
          } else if (sql.includes('INSERT INTO stock_movements')) {
            state.movements.push({ product_id: args[1], reference_note: args[3] });
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(statements: QueryableStatement[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return { db, state };
}

const fake = makeFakeD1('site-1', 10);
const releaseInput = {
  websiteId: 'site-1',
  orderNumber: 'TEST-ORD-1',
  lines: [{ productId: 10, quantity: 2 }],
  actorId: 'user-1',
};
await releaseReservedStock({ DB: fake.db } as any, releaseInput);
await releaseReservedStock({ DB: fake.db } as any, releaseInput);
check('P0-4 failed-order stock release restores exactly once', fake.state.stock === 7);
check('P0-4 failed-order stock release records exactly one movement', fake.state.movements.length === 1);

check(
  'P0-4 paid order cannot be customer-cancelled',
  !customerCancelAllowed({ payment_status: 'paid', order_status: 'confirmed' })
);
check(
  'P0-4 refunded order cannot be customer-cancelled',
  !customerCancelAllowed({ payment_status: 'refunded', order_status: 'placed' })
);
check(
  'P0-4 unpaid placed order can be customer-cancelled',
  customerCancelAllowed({ payment_status: 'pending', order_status: 'placed' })
);

const ordersSource = readFileSync('functions/api/orders.ts', 'utf8');
check(
  'P0-4 stock reservation uses atomic D1 batch after gateway creation',
  ordersSource.includes('await batch.call(db, statements)') &&
    ordersSource.indexOf('createEdgeCashfreeOrder') < ordersSource.indexOf('await batch.call(db, statements)')
);

console.log(`\nTOTAL passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
