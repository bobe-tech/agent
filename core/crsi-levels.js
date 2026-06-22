// Per-pair CRSI buy levels — the long entry/averaging crossing threshold (crsi_buy). Single source of
// truth for seeding (bin/install.js) and recalibration (bin/set-crsi-buy.mjs). Calibrated on H1;
// update the numbers here when recalibrating.
export const CRSI_BUY = {
  'ETH/USDT': 19.7,
  'CAKE/USDT': 21.5,
  'ASTER/USDT': 16,
  'XRP/USDT': 20.3,
  'ADA/USDT': 18.4,
};
