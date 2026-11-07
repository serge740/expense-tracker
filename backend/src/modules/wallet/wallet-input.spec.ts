import { cleanWalletInput } from './wallet-input';

const ok = { name: ' Main ', bank: ' BK ', currency: 'rwf', balance: '1500.456', walletType: 'SAVINGS', accountNumber: '0788 123 456' };

describe('wallet input', () => {
  test('a good wallet is tidied', () => {
    expect(cleanWalletInput(ok, 'create')).toMatchObject({ name: 'Main', bank: 'BK', currency: 'RWF', balance: 1500.46, walletType: 'SAVINGS', accountNumber: '0788123456', last4: '3456' });
  });
  test.each([
    [{ ...ok, name: '   ' }, 'Give the wallet a name.'],
    [{ ...ok, name: 'x'.repeat(41) }, '40 characters'],
    [{ ...ok, bank: '' }, 'bank or mobile money'],
    [{ ...ok, currency: 'Francs' }, 'valid currency'],
    [{ ...ok, walletType: 'GOLD' }, 'wallet type'],
    [{ ...ok, balance: 'abc' }, 'valid balance'],
    [{ ...ok, balance: 1e12 }, 'valid balance'],
    [{ ...ok, color: 'x'.repeat(30) }, 'colour'],
    [{ ...ok, accountNumber: '9'.repeat(50) }, 'too long'],
  ])('%j is refused in words', (input, words) => {
    expect(() => cleanWalletInput(input, 'create')).toThrow(new RegExp(words));
  });
  test('a change only looks at what was sent', () => {
    expect(cleanWalletInput({ archived: true }, 'update')).toEqual({ archived: true });
    expect(cleanWalletInput({}, 'update')).toEqual({});
    expect(() => cleanWalletInput({ name: '' }, 'update')).toThrow();
    expect(cleanWalletInput({ balance: -250 }, 'update')).toEqual({ balance: -250 });
  });
});
