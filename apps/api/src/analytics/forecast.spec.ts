import { fitHoltWinters, forecastHoltWinters } from './forecast';

describe('holt-winters forecast', () => {
  const weekly = [4, 6, 7, 6, 8, 12, 10];

  it('recovers a clean weekly pattern with trend', () => {
    const y = Array.from({ length: 56 }, (_, t) => weekly[t % 7] + 0.1 * t);
    const fit = fitHoltWinters(y, 7);
    const next = forecastHoltWinters(fit, 7);
    next.forEach((step, h) => {
      const truth = weekly[(56 + h) % 7] + 0.1 * (56 + h);
      expect(Math.abs(step.value - truth)).toBeLessThan(1);
    });
    expect(fit.mape!).toBeLessThan(5);
  });

  it('widens the interval with the horizon and never goes negative', () => {
    const y = Array.from({ length: 42 }, (_, t) => weekly[t % 7] + ((t * 7919) % 5) - 2);
    const steps = forecastHoltWinters(fitHoltWinters(y, 7), 14);
    expect(steps[13].upper - steps[13].lower).toBeGreaterThan(steps[0].upper - steps[0].lower);
    steps.forEach((s) => expect(s.lower).toBeGreaterThanOrEqual(0));
  });

  it('needs at least one season plus two points', () => {
    expect(() => fitHoltWinters([1, 2, 3], 7)).toThrow();
  });
});
