import 'dotenv/config';
import { supabase } from '../src/services/supabase';
import { tableService } from '../src/services/api/tableService';
import { productService } from '../src/services/api/productService';
import { categoryService } from '../src/services/api/categoryService';
import { orderService } from '../src/services/api/orderService';
import { getTableQrUrl } from '../src/utils/qr';

async function runPart1Verification() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — PART 1 LIVE VERIFICATION SUITE');
  console.log('   (Platform, Android UI, Tables, QR, Products & Inventory)');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // STEP 0: SECURITY & RLS ENFORCEMENT CHECK (ANONYMOUS / CUSTOMER)
  // -------------------------------------------------------------
  console.log('--- STEP 0: SECURITY & RLS PRIVILEGE CHECK ---');
  await supabase.auth.signOut();
  let anonBlocked = false;
  try {
    const { error } = await supabase
      .from('tables')
      .insert([{ table_number: 'HACK-01', seating_capacity: 4, section: 'Ground Floor' }]);
    if (error) {
      anonBlocked = true;
      console.log(`✓ Unauthenticated table creation blocked by RLS: "${error.message}"`);
    }
  } catch (e: any) {
    anonBlocked = true;
  }
  if (!anonBlocked) {
    throw new Error('Security vulnerability: Anonymous user was able to insert into public.tables!');
  }

  // -------------------------------------------------------------
  // AUTHENTICATE AS ADMIN (ratnadeepdey13@gmail.com / Qwerty1@)
  // -------------------------------------------------------------
  console.log('\n--- AUTHENTICATING AS ADMIN ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });
  if (authError || !authData.user) {
    throw new Error(`Admin login failed: ${authError?.message}`);
  }
  console.log(`✓ Authenticated as ADMIN (${authData.user.email})`);

  // -------------------------------------------------------------
  // TEST 1: TABLE CREATION (SINGLE & BULK) & SEATING CAPACITY
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: SINGLE & BULK TABLE CREATION ---');
  
  // 1a. Single Table Creation
  const singleTable = await tableService.saveTable({
    table_number: 'Table 99-Test',
    section: 'AC Section',
    seating_capacity: 6,
    is_active: true,
  });
  console.log(`✓ Single table created: ${singleTable.table_number} (ID: ${singleTable.id}) | Capacity: ${singleTable.seating_capacity} Seats | Section: ${singleTable.section}`);
  if (singleTable.seating_capacity !== 6 || singleTable.section !== 'AC Section') {
    throw new Error('Single table creation failed matching parameters.');
  }

  // 1b. Table Edit (Capacity & Section)
  const updatedSingle = await tableService.saveTable({
    id: singleTable.id,
    table_number: 'Table 99-Test',
    section: 'VIP Section',
    seating_capacity: 8,
    is_active: true,
  });
  console.log(`✓ Table updated: ${updatedSingle.table_number} | New Capacity: ${updatedSingle.seating_capacity} Seats | New Section: ${updatedSingle.section}`);
  if (updatedSingle.seating_capacity !== 8 || updatedSingle.section !== 'VIP Section') {
    throw new Error('Table edit failed.');
  }

  // 1c. Bulk Table Creation
  const bulkRes: any = await tableService.createBulkTables({
    startingNumber: 801,
    count: 3,
    section: 'Outdoor',
    seatingCapacity: 4,
  });
  console.log(`✓ Bulk tables created: ${bulkRes.createdCount} tables (${bulkRes.tables.map((t: any) => t.table_number).join(', ')})`);
  if (bulkRes.createdCount !== 3) {
    throw new Error('Bulk table creation failed.');
  }

  // -------------------------------------------------------------
  // TEST 2: QR URL ENCODING & UNIQUENESS
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: UNIQUE TABLE QR GENERATION ---');
  const qrUrlSingle = getTableQrUrl(singleTable.id);
  console.log(`✓ QR URL for ${singleTable.table_number}: ${qrUrlSingle}`);
  if (!qrUrlSingle.includes(`/menu/table/${encodeURIComponent(singleTable.id)}`)) {
    throw new Error('Table QR does not encode the actual table ID route.');
  }

  for (const bt of bulkRes.tables) {
    const btUrl = getTableQrUrl(bt.id);
    console.log(`  • ${bt.table_number} QR -> ${btUrl}`);
    if (!btUrl.includes(encodeURIComponent(bt.id))) {
      throw new Error(`Bulk table ${bt.table_number} QR URL mismatch.`);
    }
  }

  // -------------------------------------------------------------
  // TEST 3: CATEGORY CRUD & VALIDATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: CATEGORY MANAGEMENT ---');
  const testCat = await categoryService.saveCategory({
    name: 'Tandoor Special Test',
    description: 'Fresh clay oven tandoori kebabs and breads',
    display_order: 99,
    is_active: true,
  });
  console.log(`✓ Category created: "${testCat.name}" (ID: ${testCat.id}, Slug: ${testCat.slug})`);

  // Edit Category
  const updatedCat = await categoryService.saveCategory({
    id: testCat.id,
    name: 'Royal Tandoor Special Test',
    description: 'Updated tandoor delicacies',
    display_order: 99,
    is_active: true,
  });
  console.log(`✓ Category edited: "${updatedCat.name}"`);

  // -------------------------------------------------------------
  // TEST 4: PRODUCT CREATION, PRICING, FOOD TYPE & VALIDATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: PRODUCT MANAGEMENT & CRUD ---');
  const testSku = `TST-TIKKA-${Date.now().toString().slice(-4)}`;
  const testProd = await productService.saveProduct({
    name: 'Murgh Malai Tikka Test',
    sku: testSku,
    category_id: updatedCat.id,
    price: 380,
    discounted_price: 350,
    stock_quantity: 50,
    food_type: 'non-veg',
    unit: 'portion',
    tax_rate: 5,
    hsn_code: '996331',
    preparation_time_mins: 20,
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    description: 'Tender chicken marinated in cream and cheese',
    is_active: true,
    is_available: true,
  });
  console.log(`✓ Product created: "${testProd.name}" | SKU: ${testProd.sku} | Price: ₹${testProd.price} | Stock: ${testProd.stock_quantity} | Food Type: ${testProd.food_type}`);

  // 4b. Edit Product Price & Stock
  const updatedProd = await productService.saveProduct({
    id: testProd.id,
    name: 'Royal Murgh Malai Tikka Test',
    sku: testSku,
    category_id: updatedCat.id,
    price: 420,
    stock_quantity: 60,
    food_type: 'non-veg',
    unit: 'plate',
  });
  console.log(`✓ Product edited: "${updatedProd.name}" | New Price: ₹${updatedProd.price} | New Stock: ${updatedProd.stock_quantity}`);
  if (updatedProd.price !== 420 || updatedProd.stock_quantity !== 60) {
    throw new Error('Product edit failed to persist updated price/stock.');
  }

  // -------------------------------------------------------------
  // TEST 5: STOCK DEDUCTION & RESTORATION ON ORDERS
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: STOCK DEDUCTION & RESTORATION ---');
  console.log(`Initial stock for ${updatedProd.name}: 60`);

  // Place order with 4 units
  const testOrder = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: singleTable.id,
    table_number: singleTable.table_number,
    customer_name: 'Test Gourmet',
    items: [
      {
        id: 'item-test-1',
        order_id: '',
        product_id: updatedProd.id,
        product_name: updatedProd.name,
        unit_price: 420,
        quantity: 4,
        tax_rate: 5,
        tax_amount: 84,
        subtotal: 1680,
        total: 1764,
      },
    ],
    payable_amount: 1764,
    payment_status: 'unpaid',
  });
  console.log(`✓ Order placed: #${testOrder.order_number} for 4x "${updatedProd.name}"`);

  // Verify stock was deducted (60 - 4 = 56)
  const { data: stockAfterOrder } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', updatedProd.id)
    .single();
  console.log(`✓ Stock after order in DB: ${stockAfterOrder?.stock_quantity} (Expected: 56)`);
  if (stockAfterOrder?.stock_quantity !== 56) {
    throw new Error(`Stock deduction failed. Expected 56, got ${stockAfterOrder?.stock_quantity}`);
  }

  // Cancel order -> Stock should be restored (56 + 4 = 60)
  await orderService.updateOrderStatus(testOrder.id, 'cancelled');
  const { data: stockAfterCancel } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', updatedProd.id)
    .single();
  console.log(`✓ Stock after order cancellation in DB: ${stockAfterCancel?.stock_quantity} (Expected: 60)`);
  if (stockAfterCancel?.stock_quantity !== 60) {
    throw new Error(`Stock restoration failed. Expected 60, got ${stockAfterCancel?.stock_quantity}`);
  }

  // -------------------------------------------------------------
  // TEST 6: OUT OF STOCK BEHAVIOR & DELETE SAFETY
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: OUT OF STOCK & DELETION SAFETY ---');
  await productService.updateStock(updatedProd.id, 0);
  const { data: zeroStockProd } = await supabase
    .from('products')
    .select('stock_quantity, is_available')
    .eq('id', updatedProd.id)
    .single();
  console.log(`✓ Out of stock test: Stock = ${zeroStockProd?.stock_quantity} | Available = ${zeroStockProd?.is_available}`);
  if (zeroStockProd?.is_available !== false) {
    throw new Error('Product with 0 stock should automatically be marked unavailable.');
  }

  // Category deletion safety check: cannot delete category with products
  let catDeleteBlocked = false;
  try {
    await categoryService.deleteCategory(updatedCat.id);
  } catch (e: any) {
    catDeleteBlocked = true;
    console.log(`✓ Category deletion correctly blocked while products exist: "${e.message}"`);
  }
  if (!catDeleteBlocked) {
    throw new Error('Category deletion was not blocked despite having products assigned.');
  }

  // Clean up test order items and test product
  await supabase.from('order_items').delete().eq('order_id', testOrder.id);
  await supabase.from('orders').delete().eq('id', testOrder.id);
  await productService.deleteProduct(updatedProd.id);
  console.log(`✓ Test product deleted successfully.`);

  // Now delete test category
  await categoryService.deleteCategory(updatedCat.id);
  console.log(`✓ Test category deleted successfully after product removal.`);

  // Clean up test tables
  await tableService.deleteTable(singleTable.id);
  if (Array.isArray((bulkRes as any).tables)) {
    for (const bt of (bulkRes as any).tables) {
      await tableService.deleteTable(bt.id);
    }
  }
  console.log(`✓ Test tables cleaned up successfully.`);

  console.log('\n================================================================');
  console.log('   ALL PART 1 TESTS EXECUTED AND PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runPart1Verification().catch((err) => {
  console.error('PART 1 VERIFICATION FAILED:', err);
  process.exit(1);
});
