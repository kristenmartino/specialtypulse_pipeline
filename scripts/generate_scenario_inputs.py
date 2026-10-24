"""Create deterministic earlier-year SYNTHETIC scenarios, never historical CMS data."""
import csv
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/sample_2023_puf_10k.csv"


def main():
    with BASE.open(newline="") as source:
        rows = list(csv.DictReader(source))
    fields = list(rows[0])
    # These are generated fixture IDs, not registry identifiers. The old fixture
    # reused IDs for unrelated names; assign one stable synthetic ID per record.
    for index, row in enumerate(rows, 1):
        row["npi"] = str(9000000000 + index)
    write(BASE, fields, rows)
    for year in (2021, 2022):
        distance = 2023 - year
        scenario = []
        for row in rows:
            changed = dict(row)
            # Fixed per-specialty scenario rate [-4%, +4%] for payment, not an estimate.
            rate = Decimal(sum(map(ord, row["provider_type"])) % 9 - 4) / 100
            payment_factor = (1 + rate) ** distance
            charge_factor = Decimal(1) - Decimal("0.02") * distance
            volume_factor = Decimal(1) - Decimal("0.04") * distance
            for column in ("avg_mdcr_pymt_amt", "avg_mdcr_alowd_amt", "avg_mdcr_stdzd_amt"):
                changed[column] = str((Decimal(row[column]) * payment_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            changed["avg_sbmtd_chrg"] = str((Decimal(row["avg_sbmtd_chrg"]) * charge_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            for column in ("tot_srvcs", "tot_benes", "tot_bene_day_srvcs"):
                changed[column] = str(max(11 if column == "tot_srvcs" else 1, int((Decimal(row[column]) * volume_factor).quantize(Decimal(1), rounding=ROUND_HALF_UP))))
            scenario.append(changed)
        write(ROOT / f"data/sample_{year}_puf_10k.csv", fields, scenario)
    print(f"Wrote {len(rows)} synthetic rows per year; 2021/2022 are deterministic scenarios")


def write(path, fields, rows):
    with path.open("w", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
