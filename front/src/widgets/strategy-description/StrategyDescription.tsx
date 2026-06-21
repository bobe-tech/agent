// Plain-language strategy description — for the dashboard (the "Strategy" tab) and the hackathon submission.
// Static content (does not depend on the pair). Previously this showed raw parameters (StrategyParams).
export function StrategyDescription() {
  return (
    <div className="prose-sm max-w-2xl space-y-5 text-sm leading-relaxed">
      <h3 className="text-base font-semibold">
        BoBe Agent — a trading agent by the{' '}
        <a
          href="https://bobe.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          BoBe App
        </a>{' '}
        team
      </h3>

      <div>
        <h4 className="font-semibold">Signals &amp; Data</h4>
        <p className="mt-1 text-muted">
          The strategy is built on technical indicators — trend strength (ADX), RSI (reversal momentum), and volatility
          (ATR) — combined with CoinMarketCap market data via CMC Agent Hub (Fear &amp; Greed Index, BTC dominance,
          derivatives).
        </p>
      </div>

      <div>
        <h4 className="font-semibold">Logic</h4>
        <p className="mt-1 text-muted">
          Long only. The agent buys not at the highs, but on a confirmed upward reversal: when there's upward momentum,
          the trend is strong enough, and RSI is turning up from below. If the price moves against the position, it
          averages down (DCA). It only exits in profit, via a dynamic take-profit.
        </p>
      </div>

      <div>
        <h4 className="font-semibold">Execution</h4>
        <p className="mt-1 text-muted">
          We trade 4 BSC pairs (BTCB, ETH, BNB, CAKE) through the Trust Wallet Agent Kit on PancakeSwap.
        </p>
      </div>

      <div>
        <h4 className="font-semibold">
          Hackathon{' '}
          <a
            href="https://coinmarketcap.com/api/hackathon/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            BNB HACK 2026
          </a>
        </h4>
        <p className="mt-1 text-muted">
          The full sponsor stack is used: data from CoinMarketCap via CMC Agent Hub, trades are executed through the
          Trust Wallet Agent Kit, and the execution venue is PancakeSwap on the BNB Chain network.
        </p>
      </div>
    </div>
  );
}
