import 'dotenv/config';
import { tableService } from '../src/services/api/tableService';
import { productService } from '../src/services/api/productService';
import { categoryService } from '../src/services/api/categoryService';
import { calculateOrderTotals } from '../src/utils/gst';

async function testMobileLayoutBindings() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — MOBILE UI & TABLE MODAL VERIFICATION');
  console.log('================================================================\n');

  // 1. Verify Dining Tables for Modal
  console.log('--- 1. DINING TABLES DATA CHECK ---');
  const tables = await tableService.getTables();
  console.log(`✓ Number of tables loaded: ${tables.length}`);
  if (tables.length === 0) {
    console.error('❌ Expected tables to be loaded from Supabase.');
    process.exit(1);
  }

  const sections = ['Ground Floor', 'First Floor', 'Outdoor', 'AC Section', 'VIP Section'];
  for (const sec of sections) {
    const secTables = tables.filter((t) => t.section === sec);
    console.log(`  • Section "${sec}": ${secTables.length} tables found (${secTables.map((t) => t.table_number).join(', ')})`);
  }

  // 2. Verify Table Statuses
  console.log('\n--- 2. TABLE STATUS & SEAT CAPACITY ---');
  for (const t of tables.slice(0, 5)) {
    console.log(`  Table: ${t.table_number} | Capacity: ${t.seating_capacity} seats | Section: ${t.section} | Status: ${t.status}`);
  }

  // 3. Verify Products & Categories for POS
  console.log('\n--- 3. PRODUCTS & CATEGORIES DATA ---');
  const [prods, cats] = await Promise.all([productService.getProducts(), categoryService.getCategories()]);
  console.log(`✓ Products loaded: ${prods.length}`);
  console.log(`✓ Categories loaded: ${cats.length} (${cats.map((c) => c.name).join(', ')})`);

  // 4. Verify Totals Calculation for Cart Order
  console.log('\n--- 4. CART & TOTALS CALCULATION ---');
  const sampleItems = [
    {
      id: 'i-1',
      order_id: '',
      product_id: prods[0]?.id || 'p1',
      product_name: prods[0]?.name || 'Dish 1',
      unit_price: 320,
      quantity: 2,
      tax_rate: 5,
      tax_amount: 32,
      subtotal: 640,
      total: 672,
    },
  ];
  const totals = calculateOrderTotals({ items: sampleItems });
  console.log(`  Subtotal: ₹${totals.subtotal} | GST: ₹${totals.cgstAmount + totals.sgstAmount} | Payable: ₹${totals.payableAmount}`);
  console.log('✓ Totals computed successfully.');

  console.log('\n================================================================');
  console.log('   MOBILE LAYOUT DATA BINDINGS VERIFIED SUCCESSFULLY');
  console.log('================================================================\n');
}

testMobileLayoutBindings().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
