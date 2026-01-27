import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Comprehensive categories based on Mint, YNAB, Plaid standards
const SYSTEM_CATEGORIES = [
  // INCOME
  { name: 'Income', slug: 'income', icon: 'DollarSign', color: '#22c55e', sort_order: 100 },
  { name: 'Salary & Wages', slug: 'salary-wages', icon: 'Briefcase', color: '#22c55e', sort_order: 101 },
  { name: 'Freelance & Contract', slug: 'freelance-contract', icon: 'FileText', color: '#22c55e', sort_order: 102, schedule_c_category: 'gross-receipts' },
  { name: 'Business Income', slug: 'business-income', icon: 'Building', color: '#22c55e', sort_order: 103, schedule_c_category: 'gross-receipts' },
  { name: 'Interest & Dividends', slug: 'interest-dividends', icon: 'TrendingUp', color: '#22c55e', sort_order: 104 },
  { name: 'Refunds & Reimbursements', slug: 'refunds-reimbursements', icon: 'RotateCcw', color: '#22c55e', sort_order: 105 },
  { name: 'Rental Income', slug: 'rental-income', icon: 'Home', color: '#22c55e', sort_order: 106 },
  { name: 'Other Income', slug: 'other-income', icon: 'Plus', color: '#22c55e', sort_order: 109 },

  // FOOD & DINING
  { name: 'Food & Dining', slug: 'food-dining', icon: 'Utensils', color: '#f97316', sort_order: 200 },
  { name: 'Groceries', slug: 'groceries', icon: 'ShoppingCart', color: '#f97316', sort_order: 201 },
  { name: 'Restaurants', slug: 'restaurants', icon: 'UtensilsCrossed', color: '#f97316', sort_order: 202 },
  { name: 'Coffee Shops', slug: 'coffee-shops', icon: 'Coffee', color: '#f97316', sort_order: 203 },
  { name: 'Fast Food', slug: 'fast-food', icon: 'Sandwich', color: '#f97316', sort_order: 204 },
  { name: 'Bars & Alcohol', slug: 'bars-alcohol', icon: 'Wine', color: '#f97316', sort_order: 205 },
  { name: 'Food Delivery', slug: 'food-delivery', icon: 'Truck', color: '#f97316', sort_order: 206 },

  // SHOPPING
  { name: 'Shopping', slug: 'shopping', icon: 'ShoppingBag', color: '#ec4899', sort_order: 300 },
  { name: 'Amazon', slug: 'amazon', icon: 'Package', color: '#ec4899', sort_order: 301 },
  { name: 'Clothing & Apparel', slug: 'clothing-apparel', icon: 'Shirt', color: '#ec4899', sort_order: 302 },
  { name: 'Electronics', slug: 'electronics', icon: 'Laptop', color: '#ec4899', sort_order: 303 },
  { name: 'Home Goods', slug: 'home-goods', icon: 'Lamp', color: '#ec4899', sort_order: 304 },
  { name: 'General Merchandise', slug: 'general-merchandise', icon: 'Store', color: '#ec4899', sort_order: 305 },
  { name: 'Online Shopping', slug: 'online-shopping', icon: 'Globe', color: '#ec4899', sort_order: 306 },

  // HOUSING
  { name: 'Housing', slug: 'housing', icon: 'Home', color: '#8b5cf6', sort_order: 400 },
  { name: 'Rent', slug: 'rent', icon: 'Key', color: '#8b5cf6', sort_order: 401 },
  { name: 'Mortgage', slug: 'mortgage', icon: 'Building2', color: '#8b5cf6', sort_order: 402 },
  { name: 'Home Insurance', slug: 'home-insurance', icon: 'Shield', color: '#8b5cf6', sort_order: 403 },
  { name: 'Home Maintenance', slug: 'home-maintenance', icon: 'Wrench', color: '#8b5cf6', sort_order: 404 },
  { name: 'Home Improvement', slug: 'home-improvement', icon: 'Hammer', color: '#8b5cf6', sort_order: 405 },

  // TRANSPORTATION
  { name: 'Transportation', slug: 'transportation', icon: 'Car', color: '#3b82f6', sort_order: 500 },
  { name: 'Gas & Fuel', slug: 'gas-fuel', icon: 'Fuel', color: '#3b82f6', sort_order: 501, schedule_c_category: 'car-truck-expenses', is_deductible: true },
  { name: 'Public Transit', slug: 'public-transit', icon: 'Train', color: '#3b82f6', sort_order: 502 },
  { name: 'Uber & Lyft', slug: 'uber-lyft', icon: 'Navigation', color: '#3b82f6', sort_order: 503 },
  { name: 'Parking', slug: 'parking', icon: 'ParkingCircle', color: '#3b82f6', sort_order: 504, schedule_c_category: 'car-truck-expenses', is_deductible: true },
  { name: 'Car Insurance', slug: 'car-insurance', icon: 'ShieldCheck', color: '#3b82f6', sort_order: 505, schedule_c_category: 'car-truck-expenses', is_deductible: true },
  { name: 'Car Maintenance', slug: 'car-maintenance', icon: 'Settings', color: '#3b82f6', sort_order: 506, schedule_c_category: 'car-truck-expenses', is_deductible: true },
  { name: 'Car Payment', slug: 'car-payment', icon: 'CreditCard', color: '#3b82f6', sort_order: 507 },

  // UTILITIES
  { name: 'Utilities & Bills', slug: 'utilities-bills', icon: 'Zap', color: '#eab308', sort_order: 600 },
  { name: 'Electric', slug: 'electric', icon: 'Lightbulb', color: '#eab308', sort_order: 601 },
  { name: 'Gas (Utility)', slug: 'gas-utility', icon: 'Flame', color: '#eab308', sort_order: 602 },
  { name: 'Water', slug: 'water', icon: 'Droplet', color: '#eab308', sort_order: 603 },
  { name: 'Internet', slug: 'internet', icon: 'Wifi', color: '#eab308', sort_order: 604 },
  { name: 'Phone & Mobile', slug: 'phone-mobile', icon: 'Smartphone', color: '#eab308', sort_order: 605 },
  { name: 'Cable & Streaming', slug: 'cable-streaming', icon: 'Tv', color: '#eab308', sort_order: 606 },

  // HEALTH
  { name: 'Health & Wellness', slug: 'health-wellness', icon: 'Heart', color: '#ef4444', sort_order: 700 },
  { name: 'Doctor & Medical', slug: 'doctor-medical', icon: 'Stethoscope', color: '#ef4444', sort_order: 701 },
  { name: 'Pharmacy', slug: 'pharmacy', icon: 'Pill', color: '#ef4444', sort_order: 702 },
  { name: 'Health Insurance', slug: 'health-insurance', icon: 'HeartPulse', color: '#ef4444', sort_order: 703 },
  { name: 'Gym & Fitness', slug: 'gym-fitness', icon: 'Dumbbell', color: '#ef4444', sort_order: 704 },

  // ENTERTAINMENT
  { name: 'Entertainment', slug: 'entertainment', icon: 'Gamepad2', color: '#06b6d4', sort_order: 800 },
  { name: 'Movies & Events', slug: 'movies-events', icon: 'Film', color: '#06b6d4', sort_order: 801 },
  { name: 'Music & Spotify', slug: 'music-spotify', icon: 'Music', color: '#06b6d4', sort_order: 802 },
  { name: 'Games & Apps', slug: 'games-apps', icon: 'Gamepad', color: '#06b6d4', sort_order: 803 },
  { name: 'Books & Media', slug: 'books-media', icon: 'BookOpen', color: '#06b6d4', sort_order: 804 },

  // PERSONAL CARE
  { name: 'Personal Care', slug: 'personal-care', icon: 'Sparkles', color: '#d946ef', sort_order: 900 },
  { name: 'Hair & Beauty', slug: 'hair-beauty', icon: 'Scissors', color: '#d946ef', sort_order: 901 },
  { name: 'Spa & Massage', slug: 'spa-massage', icon: 'Flower2', color: '#d946ef', sort_order: 902 },

  // SUBSCRIPTIONS
  { name: 'Subscriptions', slug: 'subscriptions', icon: 'RefreshCw', color: '#6366f1', sort_order: 1000 },
  { name: 'Streaming Services', slug: 'streaming-services', icon: 'Play', color: '#6366f1', sort_order: 1001 },
  { name: 'Software & SaaS', slug: 'software-saas', icon: 'Code', color: '#6366f1', sort_order: 1002, schedule_c_category: 'office-expense', is_deductible: true },
  { name: 'Cloud Storage', slug: 'cloud-storage', icon: 'Cloud', color: '#6366f1', sort_order: 1005, schedule_c_category: 'office-expense', is_deductible: true },

  // TRAVEL
  { name: 'Travel', slug: 'travel', icon: 'Plane', color: '#14b8a6', sort_order: 1100 },
  { name: 'Flights', slug: 'flights', icon: 'PlaneTakeoff', color: '#14b8a6', sort_order: 1101, schedule_c_category: 'travel', is_deductible: true },
  { name: 'Hotels & Lodging', slug: 'hotels-lodging', icon: 'Hotel', color: '#14b8a6', sort_order: 1102, schedule_c_category: 'travel', is_deductible: true },
  { name: 'Vacation', slug: 'vacation', icon: 'Palmtree', color: '#14b8a6', sort_order: 1103 },
  { name: 'Rental Car', slug: 'rental-car', icon: 'Car', color: '#14b8a6', sort_order: 1105, schedule_c_category: 'travel', is_deductible: true },

  // BUSINESS
  { name: 'Business', slug: 'business', icon: 'Briefcase', color: '#0ea5e9', sort_order: 1200 },
  { name: 'Office Supplies', slug: 'office-supplies', icon: 'Paperclip', color: '#0ea5e9', sort_order: 1201, schedule_c_category: 'office-expense', is_deductible: true },
  { name: 'Advertising & Marketing', slug: 'advertising-marketing', icon: 'Megaphone', color: '#0ea5e9', sort_order: 1202, schedule_c_category: 'advertising', is_deductible: true },
  { name: 'Professional Services', slug: 'professional-services', icon: 'UserCheck', color: '#0ea5e9', sort_order: 1203, schedule_c_category: 'legal-professional', is_deductible: true },
  { name: 'Legal & Accounting', slug: 'legal-accounting', icon: 'Scale', color: '#0ea5e9', sort_order: 1204, schedule_c_category: 'legal-professional', is_deductible: true },
  { name: 'Business Insurance', slug: 'business-insurance', icon: 'Shield', color: '#0ea5e9', sort_order: 1205, schedule_c_category: 'insurance', is_deductible: true },
  { name: 'Equipment', slug: 'equipment', icon: 'Monitor', color: '#0ea5e9', sort_order: 1206, schedule_c_category: 'depreciation', is_deductible: true },
  { name: 'Contractors', slug: 'contractors', icon: 'Users', color: '#0ea5e9', sort_order: 1207, schedule_c_category: 'contract-labor', is_deductible: true },
  { name: 'Business Meals', slug: 'business-meals', icon: 'Coffee', color: '#0ea5e9', sort_order: 1208, schedule_c_category: 'meals', is_deductible: true },

  // EDUCATION
  { name: 'Education', slug: 'education', icon: 'GraduationCap', color: '#a855f7', sort_order: 1300 },
  { name: 'Tuition', slug: 'tuition', icon: 'School', color: '#a855f7', sort_order: 1301 },
  { name: 'Courses & Training', slug: 'courses-training', icon: 'Presentation', color: '#a855f7', sort_order: 1303 },

  // FINANCIAL
  { name: 'Financial', slug: 'financial', icon: 'Landmark', color: '#64748b', sort_order: 1400 },
  { name: 'Bank Fees', slug: 'bank-fees', icon: 'Building', color: '#64748b', sort_order: 1401 },
  { name: 'ATM Withdrawals', slug: 'atm-withdrawals', icon: 'Banknote', color: '#64748b', sort_order: 1402 },
  { name: 'Credit Card Payment', slug: 'credit-card-payment', icon: 'CreditCard', color: '#64748b', sort_order: 1403 },
  { name: 'Investments', slug: 'investments', icon: 'LineChart', color: '#64748b', sort_order: 1405 },

  // GIFTS & DONATIONS
  { name: 'Gifts & Donations', slug: 'gifts-donations', icon: 'Gift', color: '#f43f5e', sort_order: 1500 },
  { name: 'Gifts Given', slug: 'gifts-given', icon: 'Package', color: '#f43f5e', sort_order: 1501 },
  { name: 'Charity & Donations', slug: 'charity-donations', icon: 'Heart', color: '#f43f5e', sort_order: 1502, schedule_c_category: 'charitable', is_deductible: true },

  // FAMILY
  { name: 'Family', slug: 'family', icon: 'Users', color: '#f59e0b', sort_order: 1600 },
  { name: 'Childcare', slug: 'childcare', icon: 'Baby', color: '#f59e0b', sort_order: 1601 },
  { name: 'Kids Activities', slug: 'kids-activities', icon: 'Bike', color: '#f59e0b', sort_order: 1602 },

  // PETS
  { name: 'Pets', slug: 'pets', icon: 'PawPrint', color: '#84cc16', sort_order: 1700 },
  { name: 'Pet Food', slug: 'pet-food', icon: 'Bowl', color: '#84cc16', sort_order: 1701 },
  { name: 'Veterinary', slug: 'veterinary', icon: 'Stethoscope', color: '#84cc16', sort_order: 1702 },

  // TRANSFERS
  { name: 'Transfers', slug: 'transfers', icon: 'ArrowLeftRight', color: '#94a3b8', sort_order: 1800 },
  { name: 'Transfer In', slug: 'transfer-in', icon: 'ArrowDownLeft', color: '#94a3b8', sort_order: 1801 },
  { name: 'Transfer Out', slug: 'transfer-out', icon: 'ArrowUpRight', color: '#94a3b8', sort_order: 1802 },
  { name: 'Account Transfer', slug: 'account-transfer', icon: 'RefreshCw', color: '#94a3b8', sort_order: 1803 },

  // OTHER
  { name: 'Other', slug: 'other', icon: 'MoreHorizontal', color: '#71717a', sort_order: 1900 },
  { name: 'Miscellaneous', slug: 'miscellaneous', icon: 'Box', color: '#71717a', sort_order: 1901 },
  { name: 'Cash & ATM', slug: 'cash-atm', icon: 'Banknote', color: '#71717a', sort_order: 1902 },
  { name: 'Unknown', slug: 'unknown', icon: 'HelpCircle', color: '#71717a', sort_order: 1904 },
]

// POST /api/categories/seed - Seed system categories
export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if categories already exist
    const { data: existing } = await supabase
      .from('transaction_categories')
      .select('id')
      .is('user_id', null)
      .limit(1)

    if (existing && existing.length > 0) {
      // Delete existing system categories first
      await supabase
        .from('transaction_categories')
        .delete()
        .is('user_id', null)
    }

    // Insert all system categories
    const categoriesToInsert = SYSTEM_CATEGORIES.map(cat => ({
      user_id: null as null,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      is_system: true,
      sort_order: cat.sort_order,
      schedule_c_category: cat.schedule_c_category || null,
      is_deductible: cat.is_deductible || false,
    }))

    const { data, error } = await supabase
      .from('transaction_categories')
      .insert(categoriesToInsert as never)
      .select()

    if (error) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      categoriesCreated: data?.length || 0,
      message: `Created ${data?.length || 0} system categories`,
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Failed to seed categories' },
      { status: 500 }
    )
  }
}
