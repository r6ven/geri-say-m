import copy
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from availability import get_availability, load_config


class AvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.config = load_config()

    def states(self, stamp, config=None):
        result = get_availability(datetime.fromisoformat(stamp), config or self.config)
        return {p["id"]: p["state"] for p in result["people"]}

    def test_all_26_lessons_start_and_end_boundaries(self):
        self.assertEqual(sum(len(v) for v in self.config["people"]["seyda"]["weekly_lessons"].values()), 26)
        for weekday, lessons in self.config["people"]["seyda"]["weekly_lessons"].items():
            day = (datetime.fromisoformat("2026-10-05") + timedelta(days=int(weekday))).date().isoformat()
            for lesson in self.config["school"]["lesson_periods"]:
                start = datetime.fromisoformat(f'{day}T{lesson["start"]}:00+03:00')
                end = datetime.fromisoformat(f'{day}T{lesson["end"]}:00+03:00')
                self.assertEqual((end-start).total_seconds(), 2400)
                with self.subTest(day=day, lesson=lesson["number"]):
                    self.assertEqual(self.states(start.isoformat())["seyda"], "busy" if lesson["number"] in lessons else "active")
                    self.assertEqual(self.states(end.isoformat())["seyda"], "active")

    def test_school_recess_lunch_and_free_lessons(self):
        for clock in ["09:40", "09:54", "10:35", "11:25", "12:15", "12:49", "13:30", "14:20", "15:10", "16:00"]:
            with self.subTest(clock=clock):
                self.assertEqual(self.states(f"2026-10-08T{clock}:00+03:00")["seyda"], "active")
        self.assertEqual(self.states("2026-10-05T12:50:00+03:00")["seyda"], "active")
        self.assertEqual(self.states("2026-10-07T12:50:00+03:00")["seyda"], "busy")

    def test_updated_program_effective_october_5(self):
        self.assertEqual(self.config["people"]["seyda"]["weekly_lessons"], {
            "0": [1, 2, 3, 4], "1": [1, 2, 3, 4], "2": [1, 2, 3, 4, 5],
            "3": [1, 2, 3, 4, 6, 7, 8], "4": [1, 2, 5, 6, 7, 8]})
        for day, third, fifth in [("2026-09-28", "active", "busy"),
                                  ("2026-10-05", "busy", "active"),
                                  ("2026-10-12", "busy", "active")]:
            with self.subTest(day=day):
                self.assertEqual(self.states(f"{day}T10:45:00+03:00")["seyda"], third)
                self.assertEqual(self.states(f"{day}T12:50:00+03:00")["seyda"], fifth)
                self.assertEqual(self.states(f"{day}T11:35:00+03:00")["seyda"], "busy")

    def test_work_boundaries_and_weekends(self):
        for clock, expected in [("08:29", "active"), ("08:30", "busy"), ("11:59", "busy"), ("12:00", "active"), ("12:59", "active"), ("13:00", "busy"), ("17:59", "busy"), ("18:00", "active")]:
            self.assertEqual(self.states(f"2026-10-02T{clock}:00+03:00")["ridvan"], expected)
        self.assertEqual(self.states("2026-10-03T09:00:00+03:00"), {"seyda":"active", "ridvan":"active"})

    def test_all_verified_public_holidays_and_half_days(self):
        for holiday in self.config["public_holidays"]:
            stamp = f'{holiday["date"]}T{holiday["start"]}:00+03:00'
            with self.subTest(holiday=holiday):
                self.assertEqual(self.states(stamp), {"seyda":"active", "ridvan":"active"})
        self.assertEqual(self.states("2026-10-28T12:59:59+03:00")["seyda"], "busy")
        self.assertEqual(self.states("2026-10-28T13:00:00+03:00"), {"seyda":"active", "ridvan":"active"})

    def test_school_breaks_only_affect_teacher(self):
        for day in ["2026-11-16", "2026-11-20", "2027-01-25", "2027-02-05", "2027-03-08", "2027-03-12", "2027-07-05"]:
            self.assertEqual(self.states(f"{day}T09:00:00+03:00"), {"seyda":"active", "ridvan":"busy"})
        self.assertEqual(self.states("2027-02-08T09:00:00+03:00")["seyda"], "busy")
        self.assertEqual(self.states("2027-06-25T09:00:00+03:00")["seyda"], "busy")

    def test_expired_school_program_and_unverified_holiday_year(self):
        self.assertEqual(self.states("2027-09-01T09:00:00+03:00"), {"seyda":"unknown", "ridvan":"busy"})
        self.assertEqual(self.states("2028-01-03T09:00:00+03:00"), {"seyda":"unknown", "ridvan":"unknown"})

    def test_timezone_and_next_transition(self):
        stamp = "2026-10-02T08:59:00+03:00"
        utc = "2026-10-02T05:59:00+00:00"
        self.assertEqual(self.states(stamp), self.states(utc))
        result = get_availability(datetime.fromisoformat(stamp), self.config)
        self.assertEqual(result["valid_until"], "2026-10-02T09:00:00+03:00")
        result = get_availability(datetime.fromisoformat("2026-10-28T12:59:00+03:00"), self.config)
        self.assertEqual(result["valid_until"], "2026-10-28T13:00:00+03:00")

    def test_personal_day_override(self):
        config = copy.deepcopy(self.config)
        config["people"]["ridvan"]["date_overrides"]["2026-10-02"] = {"periods": []}
        self.assertEqual(self.states("2026-10-02T09:00:00+03:00", config), {"seyda":"busy", "ridvan":"active"})


if __name__ == "__main__":
    unittest.main()
