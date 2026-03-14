import { DateTime } from 'luxon';
export interface ParsedTime {
    date: DateTime;
    relative: string;
}
export declare function parseTime(input: string, timezone: string): ParsedTime | null;
//# sourceMappingURL=parseTime.d.ts.map