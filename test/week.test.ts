import assert from "node:assert/strict";
import { test } from "node:test";
import { lastCompleteWeek, previousWeek, todayInSydney, toSydneyDate, weekContaining } from "../src/week.ts";

test("weekContaining runs Monday to Sunday", () => {
  assert.deepEqual(weekContaining("2026-10-22"), { start: "2026-10-19", end: "2026-10-25" }); // Thursday
  assert.deepEqual(weekContaining("2026-10-19"), { start: "2026-10-19", end: "2026-10-25" }); // Monday
  assert.deepEqual(weekContaining("2026-10-25"), { start: "2026-10-19", end: "2026-10-25" }); // Sunday
});

test("lastCompleteWeek on a Monday is the week just finished", () => {
  assert.deepEqual(lastCompleteWeek("2026-10-26"), { start: "2026-10-19", end: "2026-10-25" });
  assert.deepEqual(lastCompleteWeek("2026-10-25"), { start: "2026-10-12", end: "2026-10-18" });
});

test("previousWeek crosses month and year boundaries", () => {
  assert.deepEqual(previousWeek({ start: "2026-01-05", end: "2026-01-11" }), { start: "2025-12-29", end: "2026-01-04" });
});

test("dates are taken in Sydney time", () => {
  // 21:00 UTC Sunday is 8am Monday in Sydney during daylight saving.
  assert.equal(todayInSydney(new Date("2026-10-25T21:00:00Z")), "2026-10-26");
  assert.equal(toSydneyDate("2026-10-25T14:30:00Z"), "2026-10-26");
  assert.equal(toSydneyDate("2026-10-25"), "2026-10-25");
});
