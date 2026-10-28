-- Run after `prisma migrate deploy` for 20261028090000_categories_v2. Every query below must return no rows.

-- 1. nothing is left in a retired category
SELECT 'Transaction in a retired category' AS problem, `category`, COUNT(*) AS n FROM `Transaction`
WHERE `category` IN ('groceries','fuel','travel','rent','utilities','subscriptions','personal_care','education','family')
GROUP BY `category`;

SELECT 'ScheduledTransaction in a retired category' AS problem, `category`, COUNT(*) AS n FROM `ScheduledTransaction`
WHERE `category` IN ('groceries','fuel','travel','rent','utilities','subscriptions','personal_care','education','family')
GROUP BY `category`;

-- 2. the same person never has the same subcategory twice in one category (the unique index guarantees it; this proves the backfill respected it)
SELECT 'duplicate subcategory' AS problem, `clientId`, `kind`, `category`, `name`, COUNT(*) AS n FROM `UserSubCategory`
GROUP BY `clientId`, `kind`, `category`, `name` HAVING COUNT(*) > 1;

-- 3. every saved subcategory belongs to a real account
SELECT 'orphan subcategory' AS problem, u.`id` FROM `UserSubCategory` u LEFT JOIN `Client` c ON c.`id` = u.`clientId` WHERE c.`id` IS NULL;
