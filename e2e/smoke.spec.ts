import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 실적 캘린더 제목과 갱신 버튼이 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("실적 캘린더");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("실적 캘린더");
  await expect(page.getByRole("button", { name: /전체 갱신|갱신 중/ })).toBeVisible();
});
