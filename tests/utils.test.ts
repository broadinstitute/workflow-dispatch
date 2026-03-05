import { formatDuration, isTimedOut, toMilliseconds } from '../src/utils';

describe('utils', () => {
    describe('toMilliseconds', () => {
        it('should parse seconds', () => {
            expect(toMilliseconds('10s')).toBe(10000);
            expect(toMilliseconds('0.5s')).toBe(500);
        });

        it('should parse minutes', () => {
            expect(toMilliseconds('5m')).toBe(300000);
        });

        it('should parse hours', () => {
            expect(toMilliseconds('1h')).toBe(3600000);
        });

        it('should throw error on unknown unit', () => {
            expect(() => toMilliseconds('1x')).toThrow();
        });
    });

    describe('formatDuration', () => {
        it('should format milliseconds to HHh MMm SSs', () => {
            // 1h 1m 1s = 3600000 + 60000 + 1000 = 3661000
            expect(formatDuration(3661000)).toBe('01h 01m 01s');
            
            // 61000
            expect(formatDuration(61000)).toBe('00h 01m 01s');
            
            // 1000
            expect(formatDuration(1000)).toBe('00h 00m 01s');
        });
    });

    describe('isTimedOut', () => {
        it('should return true if timed out', () => {
            const start = Date.now() - 2000;
            const timeout = 1000;
            expect(isTimedOut(start, timeout)).toBe(true);
        });

        it('should return false if not timed out', () => {
            const start = Date.now();
            const timeout = 1000;
            expect(isTimedOut(start, timeout)).toBe(false);
        });
    });
});
