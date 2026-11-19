# 실적 캘린더 갱신이 한국 날짜가 아닌 UTC 날짜를 "오늘"로 쓴다

**Symptom**: 한국 시간 0–9시 사이에 `전체 갱신`을 누르면, 그날 접수된 DART 공시와 그날 나온 뉴스가 조회 범위에서 빠지고 다음 갱신 때 들어온다.

**Observed evidence**: 2026-11-19 `code-review low`에서 지적. `features/refresh/refresh-company.ts`의 `today()`가 `new Date().toISOString().slice(0, 10)`(UTC)이고, 이 값이 공시 목록 `end_de`, 다음 분기 컨센서스 기사 창의 끝(`windowEnd`), 재무 분기 종료 판단에 쓰인다. 화면 쪽 `features/dashboard/load.ts`는 UTC+9로 한국 날짜를 계산해 서로 다르다.

**Suspected cause**: 갱신 코드에서 날짜를 계산할 때 시간대를 고려하지 않았다.

**What was tried**: 수용 기준을 깨지 않고 다음 갱신에서 채워지므로 이번 작업(docs/specs/earnings-calendar/)에서는 고치지 않았다.

**Proposed next step**: `today()`를 `load.ts`와 같은 한국 날짜 계산으로 바꾸고, 새벽 시간대에 공시 목록 `end_de`가 당일로 잡히는지 확인한다.
