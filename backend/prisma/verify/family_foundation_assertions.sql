-- Run after `prisma migrate deploy` for 20261101090000_family_foundation. Every query below must return no rows.

-- 1. nobody is ACTIVE in two families (activeKey is unique, so this proves the index exists and holds)
SELECT 'person active in more than one family' AS problem, `clientId`, COUNT(*) AS n FROM `FamilyMember`
WHERE `status` = 'ACTIVE' GROUP BY `clientId` HAVING COUNT(*) > 1;

-- 2. activeKey is set exactly when the member is ACTIVE
SELECT 'activeKey does not match status' AS problem, `id` FROM `FamilyMember`
WHERE (`status` = 'ACTIVE' AND (`activeKey` IS NULL OR `activeKey` <> `clientId`)) OR (`status` <> 'ACTIVE' AND `activeKey` IS NOT NULL);

-- 3. every active family has exactly one OWNER
SELECT 'family without exactly one owner' AS problem, f.`id`, COUNT(m.`id`) AS owners FROM `Family` f
LEFT JOIN `FamilyMember` m ON m.`familyId` = f.`id` AND m.`role` = 'OWNER' AND m.`status` = 'ACTIVE'
WHERE f.`status` = 'ACTIVE' GROUP BY f.`id` HAVING COUNT(m.`id`) <> 1;

-- 4. an archived family has no active members
SELECT 'archived family with active members' AS problem, f.`id` FROM `Family` f
JOIN `FamilyMember` m ON m.`familyId` = f.`id` AND m.`status` = 'ACTIVE' WHERE f.`status` = 'ARCHIVED' GROUP BY f.`id`;

-- 5. no invite can grant OWNER, and none is still pending after it expired
SELECT 'invite granting owner' AS problem, `id` FROM `FamilyInvite` WHERE `role` = 'OWNER';
SELECT 'pending invite past its expiry' AS problem, `id` FROM `FamilyInvite` WHERE `status` = 'PENDING' AND `expiresAt` < NOW(3);

-- 6. no family is over the member cap (12)
SELECT 'family over 12 members' AS problem, `familyId`, COUNT(*) AS n FROM `FamilyMember` WHERE `status` = 'ACTIVE' GROUP BY `familyId` HAVING COUNT(*) > 12;
