/**
 * Facility-demand forecasting: additive Holt-Winters (ETS(A,A,A)) with a
 * weekly season, smoothing parameters chosen by grid search on one-step-ahead
 * squared error, and prediction intervals from the ETS(A,A,A) variance formula
 *   σ²_h = σ² · (1 + Σ_{j=1}^{h-1} c_j²),  c_j = α(1 + jβ) + γ·[j mod m = 0].
 */

export interface HoltWintersParams {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface HoltWintersFit extends HoltWintersParams {
  seasonLength: number;
  level: number;
  trend: number;
  /** Last `seasonLength` seasonal components, oldest first. */
  season: number[];
  fitted: (number | null)[];
  sse: number;
  rmse: number;
  mape: number | null;
}

export interface ForecastStep {
  value: number;
  lower: number;
  upper: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function run(y: number[], m: number, p: HoltWintersParams) {
  const first = y.slice(0, m);
  let level = mean(first);
  let trend = y.length >= 2 * m ? (mean(y.slice(m, 2 * m)) - level) / m : 0;
  const season = first.map((v) => v - level);
  const fitted: (number | null)[] = new Array(y.length).fill(null);
  let sse = 0;
  let absPct = 0;
  let pctCount = 0;
  let count = 0;

  for (let t = 0; t < y.length; t++) {
    const s = season[t % m];
    const yhat = level + trend + s;
    if (t >= m) {
      fitted[t] = yhat;
      const err = y[t] - yhat;
      sse += err * err;
      count++;
      if (y[t] !== 0) {
        absPct += Math.abs(err / y[t]);
        pctCount++;
      }
    }
    const prevLevel = level;
    level = p.alpha * (y[t] - s) + (1 - p.alpha) * (level + trend);
    trend = p.beta * (level - prevLevel) + (1 - p.beta) * trend;
    season[t % m] = p.gamma * (y[t] - level) + (1 - p.gamma) * s;
  }
  // rotate so season[0] is the component for time index y.length
  const rotated = season.map((_, i) => season[(y.length + i) % m]);
  return {
    level,
    trend,
    season: rotated,
    fitted,
    sse,
    count,
    mape: pctCount ? (absPct / pctCount) * 100 : null,
  };
}

export function fitHoltWinters(y: number[], seasonLength = 7, grid = 9): HoltWintersFit {
  if (y.length < seasonLength + 2) throw new Error(`need at least ${seasonLength + 2} observations`);
  const values = Array.from({ length: grid }, (_, i) => (i + 1) / (grid + 1)); // 0.1 … 0.9
  let best: { p: HoltWintersParams; r: ReturnType<typeof run> } | null = null;
  for (const alpha of values) {
    for (const beta of [0.01, ...values.filter((v) => v <= 0.5)]) {
      for (const gamma of values) {
        const r = run(y, seasonLength, { alpha, beta, gamma });
        if (!best || r.sse < best.r.sse) best = { p: { alpha, beta, gamma }, r };
      }
    }
  }
  const { p, r } = best!;
  return {
    ...p,
    seasonLength,
    level: r.level,
    trend: r.trend,
    season: r.season,
    fitted: r.fitted,
    sse: r.sse,
    rmse: Math.sqrt(r.sse / Math.max(1, r.count)),
    mape: r.mape,
  };
}

export function forecastHoltWinters(fit: HoltWintersFit, horizon: number, z = 1.96): ForecastStep[] {
  const m = fit.seasonLength;
  const out: ForecastStep[] = [];
  let cumulative = 0;
  for (let h = 1; h <= horizon; h++) {
    if (h > 1) {
      const j = h - 1;
      const c = fit.alpha * (1 + j * fit.beta) + (j % m === 0 ? fit.gamma : 0);
      cumulative += c * c;
    }
    const value = fit.level + h * fit.trend + fit.season[(h - 1) % m];
    const spread = z * fit.rmse * Math.sqrt(1 + cumulative);
    out.push({
      value: Math.max(0, value),
      lower: Math.max(0, value - spread),
      upper: Math.max(0, value + spread),
    });
  }
  return out;
}
