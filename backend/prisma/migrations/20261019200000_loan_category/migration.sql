-- AlterTable
ALTER TABLE `Transaction` MODIFY `category` ENUM('food', 'transport', 'shopping', 'health', 'entertainment', 'travel', 'groceries', 'salary', 'other', 'bills', 'rent', 'utilities', 'education', 'family', 'gifts', 'business', 'investment', 'subscriptions', 'personal_care', 'fuel', 'insurance', 'savings', 'freelance', 'refund', 'loan') NOT NULL;

