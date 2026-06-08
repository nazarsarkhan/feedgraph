import { getRunMode, isApiMode, isWorkerMode } from './run-mode';

describe('run-mode', () => {
  const original = process.env.RUN_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.RUN_MODE;
    else process.env.RUN_MODE = original;
  });

  describe('getRunMode', () => {
    it('returns the explicit value for api and worker', () => {
      process.env.RUN_MODE = 'api';
      expect(getRunMode()).toBe('api');
      process.env.RUN_MODE = 'worker';
      expect(getRunMode()).toBe('worker');
    });

    it("falls back to 'all' when unset or unrecognised", () => {
      delete process.env.RUN_MODE;
      expect(getRunMode()).toBe('all');
      process.env.RUN_MODE = 'nonsense';
      expect(getRunMode()).toBe('all');
    });
  });

  describe('isApiMode / isWorkerMode', () => {
    it("'all' runs both HTTP/scheduler and the processors", () => {
      expect(isApiMode('all')).toBe(true);
      expect(isWorkerMode('all')).toBe(true);
    });

    it("'api' serves HTTP + scheduler but no processors", () => {
      expect(isApiMode('api')).toBe(true);
      expect(isWorkerMode('api')).toBe(false);
    });

    it("'worker' runs processors but no HTTP or scheduler", () => {
      expect(isApiMode('worker')).toBe(false);
      expect(isWorkerMode('worker')).toBe(true);
    });

    it('reads process.env when no mode is passed', () => {
      process.env.RUN_MODE = 'worker';
      expect(isApiMode()).toBe(false);
      expect(isWorkerMode()).toBe(true);
    });
  });
});
