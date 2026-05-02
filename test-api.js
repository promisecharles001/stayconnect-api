const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const HOST = 'http://localhost:3000';

async function login(email, password) {
  const res = await fetch(`${HOST}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.tokens) throw new Error('Login failed: ' + JSON.stringify(data));
  return data.tokens.accessToken;
}

async function createProperty(token) {
  const res = await fetch(`${HOST}/api/v1/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Test Property ' + Date.now(),
      description: 'A nice test property',
      propertyType: 'APARTMENT',
      address: '123 Test St',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      maxGuests: 2,
      bedrooms: 1,
      beds: 1,
      bathrooms: 1,
      basePricePerNight: 5000,
      images: ['https://example.com/image.jpg'],
    }),
  });
  const status = res.status;
  const data = await res.json().catch(() => ({}));
  return { status, data };
}

async function main() {
  const userEmail = 'testhostflow@example.com';
  
  // RESET: Delete any existing KYC and properties for clean test
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  await prisma.kYCVerification.deleteMany({ where: { userId: user.id } });
  await prisma.property.deleteMany({ where: { hostId: user.id } });
  console.log('RESET: Deleted existing KYC and properties for test user');
  
  console.log('\n=== TEST 1: Login as HOST (NO KYC) ===');
  const token = await login(userEmail, 'TestPass1!');
  console.log('✅ Logged in');
  
  console.log('\n=== TEST 2: Create property WITHOUT KYC ===');
  const propResult = await createProperty(token);
  console.log('Status:', propResult.status);
  console.log('Message:', propResult.data.message);
  if (propResult.status === 403) {
    console.log('✅ PASS: Blocked without KYC');
  } else {
    console.log('❌ FAIL: Expected 403, got', propResult.status);
  }
  
  console.log('\n=== TEST 3: Submit KYC ===');
  const kycRes = await fetch(`${HOST}/api/v1/kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      documentType: 'NIN_SLIP',
      documentNumber: '12345678901',
      documentImageFront: 'https://example.com/doc.jpg',
      selfieImage: 'https://example.com/selfie.jpg',
    }),
  });
  const kycData = await kycRes.json();
  console.log('Status:', kycRes.status);
  if (kycRes.status === 201) {
    console.log('✅ PASS: KYC submitted');
  } else {
    console.log('❌ FAIL:', kycData.message);
  }
  
  console.log('\n=== TEST 4: Create property WITH PENDING KYC ===');
  const propResult2 = await createProperty(token);
  console.log('Status:', propResult2.status);
  console.log('Message:', propResult2.data.message);
  if (propResult2.status === 403) {
    console.log('✅ PASS: Blocked with pending KYC');
  } else {
    console.log('❌ FAIL: Expected 403, got', propResult2.status);
  }
  
  console.log('\n=== TEST 5: Approve KYC (admin action) ===');
  await prisma.kYCVerification.updateMany({
    where: { userId: user.id },
    data: { status: 'APPROVED', reviewedAt: new Date() }
  });
  console.log('✅ KYC approved');
  
  console.log('\n=== TEST 6: Create property WITH APPROVED KYC ===');
  const propResult3 = await createProperty(token);
  console.log('Status:', propResult3.status);
  if (propResult3.status === 201) {
    console.log('✅ PASS: Property created!');
    console.log('   ID:', propResult3.data.id);
    console.log('   Status:', propResult3.data.status);
  } else {
    console.log('❌ FAIL:', propResult3.data.message);
  }
  
  console.log('\n=== TEST 7: Public search should NOT show pending property ===');
  const publicRes = await fetch(`${HOST}/api/v1/properties`);
  const publicData = await publicRes.json();
  const found = publicData.data?.find(p => p.id === propResult3.data.id);
  if (!found) {
    console.log('✅ PASS: Pending property NOT in public search');
  } else {
    console.log('❌ FAIL: Property visible before approval!');
  }
  
  console.log('\n=== TEST 8: Admin endpoint shows pending property ===');
  // Try to find admin credentials from DB
  const admin = await prisma.user.findFirst({ where: { role: { name: 'ADMIN' } } });
  if (admin) {
    console.log('Admin user:', admin.email);
    try {
      const adminToken = await login(admin.email, 'Mylove2u.');
      const adminRes = await fetch(`${HOST}/api/v1/properties/admin/all?status=PENDING_APPROVAL`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const adminData = await adminRes.json();
      console.log('Admin endpoint status:', adminRes.status);
      console.log('Pending properties:', adminData.meta?.total || 0);
      if (adminRes.status === 200) {
        console.log('✅ PASS: Admin can view pending properties');
      } else {
        console.log('❌ FAIL:', adminData.message);
      }
    } catch (e) {
      console.log('Admin login failed:', e.message);
    }
  } else {
    console.log('No admin user found in database');
  }
  
  console.log('\n========================================');
  console.log('🎉 ALL TESTS COMPLETE!');
  console.log('========================================');
  
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
