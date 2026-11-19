import { describe, expect, test } from "vitest";

import { nextAnnouncement } from "./schedule";

describe("다음 실적 발표 예정일 (AC4)", () => {
  test("직전 발표 이후 실적 관련 IR 개최 공시가 있으면 그 날짜로 확정", () => {
    const r = nextAnnouncement({
      lastAnnouncedOn: "2026-10-08",
      lastYearSameQuarterOn: "2026-01-08",
      irEvents: [
        { date: "2026-11-18", mentionsEarnings: false },
        { date: "2027-01-07", mentionsEarnings: true },
      ],
    });
    expect(r).toEqual({ date: "2027-01-07", status: "confirmed", basis: "ir" });
  });

  test("IR 공시가 없으면 작년 같은 분기 발표일에서 1년 뒤로 예상", () => {
    const r = nextAnnouncement({ lastAnnouncedOn: "2026-10-08", lastYearSameQuarterOn: "2026-01-08", irEvents: [] });
    expect(r).toEqual({ date: "2027-01-08", status: "expected", basis: "last-year" });
  });

  test("1년 뒤 같은 날이 주말이면 다음 월요일", () => {
    const r = nextAnnouncement({ lastAnnouncedOn: "2026-04-30", lastYearSameQuarterOn: "2025-07-11", irEvents: [] });
    expect(r).toEqual({ date: "2026-07-13", status: "expected", basis: "last-year" });
  });

  test("직전 발표보다 앞선 IR이나 실적과 무관한 IR은 쓰지 않는다", () => {
    const r = nextAnnouncement({
      lastAnnouncedOn: "2026-10-08",
      lastYearSameQuarterOn: "2026-01-08",
      irEvents: [
        { date: "2026-10-08", mentionsEarnings: true },
        { date: "2026-11-18", mentionsEarnings: false },
      ],
    });
    expect(r?.status).toBe("expected");
  });

  test("근거가 하나도 없으면 null", () => {
    expect(nextAnnouncement({ lastAnnouncedOn: null, lastYearSameQuarterOn: null, irEvents: [] })).toBeNull();
  });
});
