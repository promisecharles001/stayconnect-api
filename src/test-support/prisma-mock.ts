/**
 * A hand-rolled PrismaService double.
 *
 * There is no database available in CI or on a dev machine here, and these
 * tests are about business rules rather than SQL — whether a host can approve
 * their own listing, what a refund is worth, whether a second withdrawal is
 * allowed. Those live in the service layer and are exactly what has broken in
 * production before, so they are worth pinning down without a database in the
 * loop.
 */
export type PrismaMock = ReturnType<typeof createPrismaMock>;

const model = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
});

export function createPrismaMock() {
  return {
    user: model(),
    property: model(),
    booking: model(),
    withdrawalRequest: model(),
    earningsLedger: model(),
    kYCVerification: model(),
    review: model(),
    conversation: model(),
    message: model(),
    wishlistItem: model(),
    // Array-style $transaction([...]) — the ops passed in are already the
    // mock calls' own return values (promises), so running them through
    // Promise.all resolves them in order exactly like the real one does.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

/** A booking row with sane defaults; override only what a test cares about. */
export function bookingRow(overrides: Record<string, any> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'BK-11111111',
    visitorId: 'visitor-1',
    hostId: 'host-1',
    propertyId: 'property-1',
    startDate: new Date('2030-01-10'),
    endDate: new Date('2030-01-12'),
    totalAmount: 50000,
    commissionAmount: 5000,
    status: 'PENDING',
    paymentProof: null,
    paymentVerified: false,
    escrowStatus: 'PENDING',
    refundAmount: null,
    refundReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A property row with sane defaults. */
export function propertyRow(overrides: Record<string, any> = {}) {
  return {
    id: 'property-1',
    hostId: 'host-1',
    title: 'Test Property',
    status: 'APPROVED',
    isAvailable: true,
    commissionPercent: 10,
    basePricePerNight: 25000,
    cleaningFee: null,
    averageRating: 0,
    address: '12 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    latitude: 6.4281,
    longitude: 3.4219,
    ...overrides,
  };
}
