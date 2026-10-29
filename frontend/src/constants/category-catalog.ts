// Ported from expo_app/constants/category-catalog.ts
import type { CategorySlug } from '@/constants/categories';

/**
 * What people actually pay for, so they can pick it in two taps.
 *
 *   category  (one of the ten, stored as `category`)
 *     group   (a tab, only for finding things; never stored)
 *       item  (what is stored as `subCategory`, e.g. "Pizza")
 *
 * An item may carry search words after "|" (brand names): "Ride app|Uber,Bolt,Yego" is saved as "Ride app" and found
 * by typing "bolt". Items are English on purpose: they are the words people use for what they bought (Netflix, Bolt,
 * MoMo fees). The names of categories and groups are translated (cat.<id> and grp.<category>.<group>).
 */
export interface CatalogItem { name: string; aliases: string[] }
export interface CatalogGroup { id: string; items: CatalogItem[] }

const item = (raw: string): CatalogItem => {
  const [name, aliases] = raw.split('|');
  return { name, aliases: aliases ? aliases.split(',') : [] };
};
const group = (id: string, items: string[]): CatalogGroup => ({ id, items: items.map(item) });

export type Catalog = Partial<Record<CategorySlug, CatalogGroup[]>>;

export const EXPENSE_CATALOG: Catalog = {
  food: [
    group('shopping', ['Groceries', 'Supermarket', 'Open market', 'Vegetables', 'Fruits', 'Meat', 'Fish', 'Chicken', 'Eggs', 'Milk', 'Bread', 'Rice', 'Flour', 'Cooking oil', 'Sugar', 'Spices', 'Snacks', 'Sweets', 'Baby food']),
    group('drinks', ['Bottled water', 'Soft drinks', 'Juice', 'Energy drinks', 'Coffee', 'Tea', 'Beer', 'Wine', 'Spirits']),
    group('eating_out', ['Restaurants', 'Fast food', 'Street food', 'Pizza', 'Burger', 'Fried chicken', 'Brochettes', 'Shawarma', 'Breakfast out', 'Dinner out', 'Work lunch', 'Canteen', 'Takeaway', 'Food delivery', 'Café', 'Bakery', 'Ice cream']),
  ],
  transport: [
    group('daily', ['Fuel', 'Moto-taxi', 'Taxi', 'Ride app|Uber,Bolt,Yego', 'Bus fare', 'Train', 'Metro', 'Ferry', 'Bicycle', 'E-scooter rental', 'Parking', 'Toll']),
    group('vehicle', ['Car repair', 'Oil change', 'Tyres', 'Car battery', 'Spare parts', 'Car wash', 'Towing', 'Vehicle licence', 'Inspection', 'Driving lessons', 'Vehicle purchase', 'Car loan payment']),
    group('trips', ['Flights', 'Baggage fees', 'Airport taxi', 'Intercity bus', 'Train ticket', 'Car rental', 'Hotel', 'Airbnb', 'Guest house', 'Visa', 'Passport', 'Tours', 'Safari', 'Park entry']),
  ],
  bills: [
    group('housing', ['Rent', 'Mortgage', 'Service charge', 'Security guard', 'Waste collection']),
    group('energy', ['Electricity', 'Prepaid electricity', 'Water', 'Cooking gas', 'Charcoal', 'Firewood', 'Generator fuel', 'Solar payment']),
    group('connectivity', ['Internet', 'WiFi', 'Airtime', 'Mobile data', 'Phone contract']),
    group('subscriptions', ['iCloud', 'Google One', 'ChatGPT', 'Microsoft 365', 'Adobe', 'Apps', 'Software']),
    group('upkeep', ['Repairs', 'Plumber', 'Electrician', 'Painting', 'Furniture', 'Appliances', 'Bedding', 'Curtains', 'Kitchenware', 'Cleaning supplies', 'Laundry', 'Dry cleaning', 'Domestic help', 'Gardener']),
    group('pets', ['Pet food', 'Vet', 'Pet grooming']),
  ],
  shopping: [
    group('clothes', ['Clothing', 'Shoes', 'Sneakers', 'Underwear', 'Bags', 'Tailor', 'Traditional wear']),
    group('accessories', ['Watch', 'Jewellery', 'Sunglasses', 'Belt', 'Wallet', 'Perfume', 'Cosmetics']),
    group('electronics', ['Phone', 'Laptop', 'Tablet', 'TV', 'Headphones', 'Earbuds', 'Speaker', 'Charger', 'Phone case', 'Power bank', 'Phone repair', 'Smartwatch']),
    group('kids', ['Kids clothes', 'Toys', 'Diapers', 'Baby formula', 'Baby gear']),
    group('other', ['Books', 'Stationery', 'Sports gear', 'Household items', 'Online orders|Amazon,Jumia,AliExpress,Temu']),
  ],
  health: [
    group('medical', ['Doctor visit', 'Clinic', 'Hospital stay', 'Surgery', 'Maternity', 'Pharmacy', 'Medicine', 'Vaccines', 'Lab tests', 'X-ray', 'Scan', 'Dentist', 'Eye test', 'Glasses', 'Contact lenses', 'Therapy', 'Mental health']),
    group('fitness', ['Gym membership', 'Yoga', 'Swimming', 'Fitness class', 'Supplements', 'Protein']),
    group('grooming', ['Haircut', 'Barber', 'Salon', 'Braids', 'Wig', 'Nails', 'Makeup', 'Spa', 'Massage', 'Skincare', 'Toiletries', 'Sanitary pads', 'Shaving']),
    group('school', ['School fees', 'University fees', 'Registration fee', 'Hostel', 'School supplies', 'Textbooks', 'Uniform', 'School shoes', 'School transport', 'School lunch', 'Printing', 'Photocopy', 'Graduation fees']),
    group('learning', ['Courses', 'Online courses|Udemy,Coursera', 'Language classes', 'Exams', 'Certification', 'Tutoring', 'Driving school']),
    group('childcare', ['Daycare', 'Nursery', 'Babysitter']),
  ],
  entertainment: [
    group('streaming', ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime', 'Apple Music', 'Showmax', 'DStv', 'Canal+', 'Boomplay']),
    group('going_out', ['Cinema', 'Concert', 'Festival', 'Theatre', 'Comedy show', 'Football match', 'Stadium ticket', 'Nightclub', 'Club entry', 'Bar', 'Karaoke', 'Bowling', 'Swimming pool', 'Amusement park', 'Zoo', 'Museum', 'Picnic', 'Party', 'Birthday party']),
    group('gaming', ['Video games', 'PlayStation', 'Xbox', 'Game Pass', 'In-game purchases', 'Gaming centre']),
    group('hobbies', ['Hobbies', 'Books for fun', 'Music lessons', 'Photography', 'Art supplies']),
    group('betting', ['Sports betting', 'Lottery', 'Casino']),
  ],
  gifts: [
    group('gifts', ['Birthday gift', 'Wedding gift', 'Baby shower', 'Bridal shower', 'Graduation gift', 'Christmas gift', "Valentine's gift"]),
    group('family', ['Family support', 'Parents', 'Siblings', "Relative's school fees", 'Pocket money', 'Allowance']),
    group('faith', ['Tithe', 'Offering', 'Church contribution', 'Zakat', 'Mosque donation']),
    group('community', ['Donations', 'Charity', 'Fundraiser', 'Crowdfunding', 'Tips', 'Helping someone']),
    group('ceremonies', ['Wedding contribution', 'Dowry', 'Funeral', 'Condolences']),
  ],
  business: [
    group('operations', ['Stock', 'Raw materials', 'Packaging', 'Equipment', 'Tools', 'Shop rent', 'Office rent', 'Office supplies', 'Business phone', 'Business internet']),
    group('people', ['Wages', 'Casual labour', 'Commission', 'Professional services', 'Accountant', 'Lawyer']),
    group('growth', ['Marketing', 'Facebook ads', 'Google ads', 'Printing', 'Business cards', 'Website', 'Domain', 'Hosting', 'Software']),
    group('delivery', ['Business transport', 'Delivery', 'Shipping', 'Courier']),
    group('legal', ['Permits', 'Trading licence', 'Business registration']),
  ],
  insurance: [
    group('insurance', ['Health insurance', 'Vehicle insurance', 'Life insurance', 'Home insurance', 'Device insurance', 'Travel insurance']),
    group('fees', ['Bank fees', 'MoMo fees|Mobile money', 'ATM fees', 'Transfer fees', 'Card fees', 'Late payment fee']),
    group('debt', ['Loan repayment', 'Loan interest', 'Credit card payment']),
    group('government', ['Income tax', 'Property tax', 'Vehicle tax', 'Traffic fine', 'Fines', 'Court fees']),
    group('legal', ['Legal fees', 'Notary']),
    group('retirement', ['Pension contribution']),
  ],
  other: [],
};

/** Income is grouped like spending (a tab per group). Only "Other" has no list: the person types their own. */
export const INCOME_CATALOG: Catalog = {
  salary: [
    group('pay', ['Monthly salary', 'Weekly wage', 'Daily wage', 'Part-time job', 'Casual work', 'Internship stipend']),
    group('extra', ['Overtime', 'Bonus', '13th month', 'Commission', 'Tips', 'Back pay', 'Leave pay']),
    group('allowances', ['Transport allowance', 'Housing allowance', 'Meal allowance', 'Airtime allowance', 'Per diem', 'Mission allowance']),
    group('leaving', ['Severance', 'Final pay', 'Pension']),
  ],
  business: [
    group('sales', ['Shop sales', 'Market stall', 'Online sales', 'Wholesale', 'Instagram sales', 'WhatsApp orders']),
    group('services', ['Service payment', 'Customer payment', 'Contract payment', 'Catering', 'Delivery fees', 'Repairs']),
    group('transport', ['Moto-taxi earnings', 'Taxi earnings', 'Ride app driver|Uber,Bolt,Yego', 'Truck hire']),
    group('farming', ['Crop harvest', 'Livestock sale', 'Milk sales', 'Eggs sales', 'Poultry sales', 'Coffee sales']),
  ],
  freelance: [
    group('tech', ['Web project', 'Mobile app', 'Software project', 'IT support', 'Maintenance fee']),
    group('creative', ['Design', 'Logo', 'Photography', 'Videography', 'Video editing', 'Music production', 'DJ gig', 'MC gig']),
    group('writing', ['Writing', 'Translation', 'Transcription']),
    group('expertise', ['Consulting', 'Tutoring', 'Training session', 'Coaching']),
    group('platforms', ['Upwork', 'Fiverr', 'Toptal']),
    group('content', ['YouTube', 'TikTok', 'Instagram', 'Sponsorship', 'Brand deal', 'Affiliate', 'Donations from fans']),
  ],
  investment: [
    group('interest', ['Savings interest', 'Fixed deposit interest', 'Bond interest', 'Treasury bills']),
    group('markets', ['Dividends', 'Stock sale', 'Crypto sale', 'Unit trust', 'Profit share']),
    group('property', ['Rental income', 'House rent received', 'Room rent', 'Shop rent received', 'Airbnb host', 'Land sale', 'Property sale']),
  ],
  gifts: [
    group('gifts', ['Birthday money', 'Wedding gift', 'Graduation gift', 'Christmas gift', 'Baby shower gift']),
    group('family', ['From parents', 'From siblings', 'From partner', 'Pocket money', 'Allowance', 'Remittance from abroad']),
    group('community', ['Wedding contribution', 'Church support', 'Donation received', 'Fundraiser', 'Crowdfunding']),
    group('support', ['Scholarship', 'Bursary', 'Grant', 'Student loan', 'Government support', 'Social aid', 'Child support', 'NGO support']),
    group('winnings', ['Sports betting win', 'Lottery', 'Prize', 'Competition', 'Raffle', 'Quiz show']),
  ],
  refund: [
    group('shopping', ['Store refund', 'Online order refund', 'Returned item', 'Cancelled order', 'Cashback']),
    group('services', ['Cancelled flight', 'Cancelled booking', 'Overpayment refund', 'MoMo reversal', 'Bank reversal']),
    group('claims', ['Insurance claim', 'Tax refund', 'Rent deposit returned', 'Work reimbursement']),
    group('people', ['Friend paid back', 'Family paid back']),
  ],
  savings: [
    group('groups', ['Ikimina payout', 'Tontine', 'SACCO', 'Savings group share-out']),
    group('accounts', ['Savings withdrawal', 'Fixed deposit matured', 'Emergency fund', 'Savings goal', 'Piggy bank', 'Mobile savings']),
  ],
  other: [],
};

export const catalogFor = (kind: 'EXPENSE' | 'INCOME'): Catalog => (kind === 'INCOME' ? INCOME_CATALOG : EXPENSE_CATALOG);
export const groupsOf = (kind: 'EXPENSE' | 'INCOME', category: CategorySlug): CatalogGroup[] => catalogFor(kind)[category] ?? [];
/** The translation key for a group's name. */
export const groupKey = (category: CategorySlug, groupId: string) => `grp.${category}.${groupId}`;
