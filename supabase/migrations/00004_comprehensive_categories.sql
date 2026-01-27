-- Comprehensive transaction categories based on industry standards (Mint, YNAB, Plaid)
-- These are system-wide categories (user_id = null) available to all users

-- First, clear any existing system categories to avoid duplicates
DELETE FROM public.transaction_categories WHERE user_id IS NULL AND is_system = true;

-- ============================================
-- INCOME CATEGORIES
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Income', 'income', 'DollarSign', '#22c55e', true, 100, null, false),
(null, 'Salary & Wages', 'salary-wages', 'Briefcase', '#22c55e', true, 101, null, false),
(null, 'Freelance & Contract', 'freelance-contract', 'FileText', '#22c55e', true, 102, 'gross-receipts', false),
(null, 'Business Income', 'business-income', 'Building', '#22c55e', true, 103, 'gross-receipts', false),
(null, 'Interest & Dividends', 'interest-dividends', 'TrendingUp', '#22c55e', true, 104, null, false),
(null, 'Refunds & Reimbursements', 'refunds-reimbursements', 'RotateCcw', '#22c55e', true, 105, null, false),
(null, 'Rental Income', 'rental-income', 'Home', '#22c55e', true, 106, null, false),
(null, 'Other Income', 'other-income', 'Plus', '#22c55e', true, 109, null, false);

-- ============================================
-- FOOD & DINING
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Food & Dining', 'food-dining', 'Utensils', '#f97316', true, 200),
(null, 'Groceries', 'groceries', 'ShoppingCart', '#f97316', true, 201),
(null, 'Restaurants', 'restaurants', 'UtensilsCrossed', '#f97316', true, 202),
(null, 'Coffee Shops', 'coffee-shops', 'Coffee', '#f97316', true, 203),
(null, 'Fast Food', 'fast-food', 'Sandwich', '#f97316', true, 204),
(null, 'Bars & Alcohol', 'bars-alcohol', 'Wine', '#f97316', true, 205),
(null, 'Food Delivery', 'food-delivery', 'Truck', '#f97316', true, 206);

-- ============================================
-- SHOPPING & MERCHANDISE
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Shopping', 'shopping', 'ShoppingBag', '#ec4899', true, 300),
(null, 'Amazon', 'amazon', 'Package', '#ec4899', true, 301),
(null, 'Clothing & Apparel', 'clothing-apparel', 'Shirt', '#ec4899', true, 302),
(null, 'Electronics', 'electronics', 'Laptop', '#ec4899', true, 303),
(null, 'Home Goods', 'home-goods', 'Lamp', '#ec4899', true, 304),
(null, 'General Merchandise', 'general-merchandise', 'Store', '#ec4899', true, 305),
(null, 'Online Shopping', 'online-shopping', 'Globe', '#ec4899', true, 306);

-- ============================================
-- HOUSING & HOME
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Housing', 'housing', 'Home', '#8b5cf6', true, 400),
(null, 'Rent', 'rent', 'Key', '#8b5cf6', true, 401),
(null, 'Mortgage', 'mortgage', 'Building2', '#8b5cf6', true, 402),
(null, 'Home Insurance', 'home-insurance', 'Shield', '#8b5cf6', true, 403),
(null, 'Home Maintenance', 'home-maintenance', 'Wrench', '#8b5cf6', true, 404),
(null, 'Home Improvement', 'home-improvement', 'Hammer', '#8b5cf6', true, 405),
(null, 'Property Tax', 'property-tax', 'Receipt', '#8b5cf6', true, 406),
(null, 'HOA Fees', 'hoa-fees', 'Users', '#8b5cf6', true, 407);

-- ============================================
-- TRANSPORTATION
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Transportation', 'transportation', 'Car', '#3b82f6', true, 500, null, false),
(null, 'Gas & Fuel', 'gas-fuel', 'Fuel', '#3b82f6', true, 501, 'car-truck-expenses', true),
(null, 'Public Transit', 'public-transit', 'Train', '#3b82f6', true, 502, null, false),
(null, 'Uber & Lyft', 'uber-lyft', 'Navigation', '#3b82f6', true, 503, null, false),
(null, 'Parking', 'parking', 'ParkingCircle', '#3b82f6', true, 504, 'car-truck-expenses', true),
(null, 'Car Insurance', 'car-insurance', 'ShieldCheck', '#3b82f6', true, 505, 'car-truck-expenses', true),
(null, 'Car Maintenance', 'car-maintenance', 'Settings', '#3b82f6', true, 506, 'car-truck-expenses', true),
(null, 'Car Payment', 'car-payment', 'CreditCard', '#3b82f6', true, 507, null, false),
(null, 'Tolls', 'tolls', 'Milestone', '#3b82f6', true, 508, 'car-truck-expenses', true);

-- ============================================
-- UTILITIES & BILLS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Utilities & Bills', 'utilities-bills', 'Zap', '#eab308', true, 600),
(null, 'Electric', 'electric', 'Lightbulb', '#eab308', true, 601),
(null, 'Gas (Utility)', 'gas-utility', 'Flame', '#eab308', true, 602),
(null, 'Water', 'water', 'Droplet', '#eab308', true, 603),
(null, 'Internet', 'internet', 'Wifi', '#eab308', true, 604),
(null, 'Phone & Mobile', 'phone-mobile', 'Smartphone', '#eab308', true, 605),
(null, 'Cable & Streaming', 'cable-streaming', 'Tv', '#eab308', true, 606),
(null, 'Trash & Recycling', 'trash-recycling', 'Trash2', '#eab308', true, 607);

-- ============================================
-- HEALTH & WELLNESS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Health & Wellness', 'health-wellness', 'Heart', '#ef4444', true, 700),
(null, 'Doctor & Medical', 'doctor-medical', 'Stethoscope', '#ef4444', true, 701),
(null, 'Pharmacy', 'pharmacy', 'Pill', '#ef4444', true, 702),
(null, 'Health Insurance', 'health-insurance', 'HeartPulse', '#ef4444', true, 703),
(null, 'Gym & Fitness', 'gym-fitness', 'Dumbbell', '#ef4444', true, 704),
(null, 'Mental Health', 'mental-health', 'Brain', '#ef4444', true, 705),
(null, 'Dental', 'dental', 'Smile', '#ef4444', true, 706),
(null, 'Vision', 'vision', 'Eye', '#ef4444', true, 707);

-- ============================================
-- ENTERTAINMENT & LEISURE
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Entertainment', 'entertainment', 'Gamepad2', '#06b6d4', true, 800),
(null, 'Movies & Events', 'movies-events', 'Film', '#06b6d4', true, 801),
(null, 'Music & Spotify', 'music-spotify', 'Music', '#06b6d4', true, 802),
(null, 'Games & Apps', 'games-apps', 'Gamepad', '#06b6d4', true, 803),
(null, 'Books & Media', 'books-media', 'BookOpen', '#06b6d4', true, 804),
(null, 'Hobbies', 'hobbies', 'Palette', '#06b6d4', true, 805),
(null, 'Sports & Recreation', 'sports-recreation', 'Trophy', '#06b6d4', true, 806);

-- ============================================
-- PERSONAL CARE
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Personal Care', 'personal-care', 'Sparkles', '#d946ef', true, 900),
(null, 'Hair & Beauty', 'hair-beauty', 'Scissors', '#d946ef', true, 901),
(null, 'Spa & Massage', 'spa-massage', 'Flower2', '#d946ef', true, 902),
(null, 'Personal Products', 'personal-products', 'Droplets', '#d946ef', true, 903);

-- ============================================
-- SUBSCRIPTIONS & MEMBERSHIPS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Subscriptions', 'subscriptions', 'RefreshCw', '#6366f1', true, 1000, null, false),
(null, 'Streaming Services', 'streaming-services', 'Play', '#6366f1', true, 1001, null, false),
(null, 'Software & SaaS', 'software-saas', 'Code', '#6366f1', true, 1002, 'office-expense', true),
(null, 'News & Magazines', 'news-magazines', 'Newspaper', '#6366f1', true, 1003, null, false),
(null, 'Memberships', 'memberships', 'CreditCard', '#6366f1', true, 1004, null, false),
(null, 'Cloud Storage', 'cloud-storage', 'Cloud', '#6366f1', true, 1005, 'office-expense', true);

-- ============================================
-- TRAVEL & VACATION
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Travel', 'travel', 'Plane', '#14b8a6', true, 1100, null, false),
(null, 'Flights', 'flights', 'PlaneTakeoff', '#14b8a6', true, 1101, 'travel', true),
(null, 'Hotels & Lodging', 'hotels-lodging', 'Hotel', '#14b8a6', true, 1102, 'travel', true),
(null, 'Vacation', 'vacation', 'Palmtree', '#14b8a6', true, 1103, null, false),
(null, 'Travel Meals', 'travel-meals', 'UtensilsCrossed', '#14b8a6', true, 1104, 'meals', true),
(null, 'Rental Car', 'rental-car', 'Car', '#14b8a6', true, 1105, 'travel', true);

-- ============================================
-- BUSINESS EXPENSES
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Business', 'business', 'Briefcase', '#0ea5e9', true, 1200, null, false),
(null, 'Office Supplies', 'office-supplies', 'Paperclip', '#0ea5e9', true, 1201, 'office-expense', true),
(null, 'Advertising & Marketing', 'advertising-marketing', 'Megaphone', '#0ea5e9', true, 1202, 'advertising', true),
(null, 'Professional Services', 'professional-services', 'UserCheck', '#0ea5e9', true, 1203, 'legal-professional', true),
(null, 'Legal & Accounting', 'legal-accounting', 'Scale', '#0ea5e9', true, 1204, 'legal-professional', true),
(null, 'Business Insurance', 'business-insurance', 'Shield', '#0ea5e9', true, 1205, 'insurance', true),
(null, 'Equipment', 'equipment', 'Monitor', '#0ea5e9', true, 1206, 'depreciation', true),
(null, 'Contractors', 'contractors', 'Users', '#0ea5e9', true, 1207, 'contract-labor', true),
(null, 'Business Meals', 'business-meals', 'Coffee', '#0ea5e9', true, 1208, 'meals', true),
(null, 'Shipping & Postage', 'shipping-postage', 'Package', '#0ea5e9', true, 1209, 'office-expense', true);

-- ============================================
-- EDUCATION
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Education', 'education', 'GraduationCap', '#a855f7', true, 1300),
(null, 'Tuition', 'tuition', 'School', '#a855f7', true, 1301),
(null, 'Books & Supplies', 'books-supplies', 'Book', '#a855f7', true, 1302),
(null, 'Courses & Training', 'courses-training', 'Presentation', '#a855f7', true, 1303),
(null, 'Student Loans', 'student-loans', 'FileText', '#a855f7', true, 1304);

-- ============================================
-- FINANCIAL
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Financial', 'financial', 'Landmark', '#64748b', true, 1400),
(null, 'Bank Fees', 'bank-fees', 'Building', '#64748b', true, 1401),
(null, 'ATM Withdrawals', 'atm-withdrawals', 'Banknote', '#64748b', true, 1402),
(null, 'Credit Card Payment', 'credit-card-payment', 'CreditCard', '#64748b', true, 1403),
(null, 'Loan Payment', 'loan-payment', 'FileCheck', '#64748b', true, 1404),
(null, 'Investments', 'investments', 'LineChart', '#64748b', true, 1405),
(null, 'Late Fees & Interest', 'late-fees-interest', 'AlertCircle', '#64748b', true, 1406),
(null, 'Wire Transfer', 'wire-transfer', 'ArrowLeftRight', '#64748b', true, 1407);

-- ============================================
-- GIFTS & DONATIONS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order, schedule_c_category, is_deductible) VALUES
(null, 'Gifts & Donations', 'gifts-donations', 'Gift', '#f43f5e', true, 1500, null, false),
(null, 'Gifts Given', 'gifts-given', 'Package', '#f43f5e', true, 1501, null, false),
(null, 'Charity & Donations', 'charity-donations', 'Heart', '#f43f5e', true, 1502, 'charitable', true),
(null, 'Gifts Received', 'gifts-received', 'PartyPopper', '#f43f5e', true, 1503, null, false);

-- ============================================
-- FAMILY & KIDS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Family', 'family', 'Users', '#f59e0b', true, 1600),
(null, 'Childcare', 'childcare', 'Baby', '#f59e0b', true, 1601),
(null, 'Kids Activities', 'kids-activities', 'Bike', '#f59e0b', true, 1602),
(null, 'Kids Clothing', 'kids-clothing', 'Shirt', '#f59e0b', true, 1603),
(null, 'School Expenses', 'school-expenses', 'Backpack', '#f59e0b', true, 1604),
(null, 'Child Support', 'child-support', 'FileHeart', '#f59e0b', true, 1605);

-- ============================================
-- PETS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Pets', 'pets', 'PawPrint', '#84cc16', true, 1700),
(null, 'Pet Food', 'pet-food', 'Bowl', '#84cc16', true, 1701),
(null, 'Veterinary', 'veterinary', 'Stethoscope', '#84cc16', true, 1702),
(null, 'Pet Supplies', 'pet-supplies', 'Package', '#84cc16', true, 1703),
(null, 'Pet Grooming', 'pet-grooming', 'Scissors', '#84cc16', true, 1704);

-- ============================================
-- TRANSFERS
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Transfers', 'transfers', 'ArrowLeftRight', '#94a3b8', true, 1800),
(null, 'Transfer In', 'transfer-in', 'ArrowDownLeft', '#94a3b8', true, 1801),
(null, 'Transfer Out', 'transfer-out', 'ArrowUpRight', '#94a3b8', true, 1802),
(null, 'Account Transfer', 'account-transfer', 'RefreshCw', '#94a3b8', true, 1803);

-- ============================================
-- OTHER / UNCATEGORIZED
-- ============================================
INSERT INTO public.transaction_categories (user_id, name, slug, icon, color, is_system, sort_order) VALUES
(null, 'Other', 'other', 'MoreHorizontal', '#71717a', true, 1900),
(null, 'Miscellaneous', 'miscellaneous', 'Box', '#71717a', true, 1901),
(null, 'Cash & ATM', 'cash-atm', 'Banknote', '#71717a', true, 1902),
(null, 'Check', 'check', 'FileCheck', '#71717a', true, 1903),
(null, 'Unknown', 'unknown', 'HelpCircle', '#71717a', true, 1904);
