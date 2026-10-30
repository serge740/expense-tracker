-- A person can be in several families. activeKey used to be the person's id (so only one family could hold it);
-- it now names the person AND the family, so it is still unique per membership and NULL once they are gone.
UPDATE `FamilyMember` SET `activeKey` = CONCAT(`clientId`, ':', `familyId`) WHERE `activeKey` IS NOT NULL;
