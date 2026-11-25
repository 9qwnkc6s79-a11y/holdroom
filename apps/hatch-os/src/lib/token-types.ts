export interface TokenBalanceView {
  code: string;
  label: string;
  unlimited: boolean;
  metered: boolean;
  balance: number;
  lifetimeUsed: number;
  lifetimePurchased: number;
  lifetimeGranted: number;
  checkoutReady: boolean;
  topupTokens: number | null;
  grantConfigured: boolean;
  message: string;
}
