"""DevicePass Final Project financial model (educational simulation). KZT."""
import json, math

BASE = dict(
    sub=25_000, fee=400, var=80, ppm=100,          # tariff, variable cost, passports/shop/month
    churn=0.015,                                   # monthly churn of active shops
    pilots=5, adds=(3, 4, 6),                      # gross new shops per month in Y1 (m2-12), Y2, Y3
    fixed=(24.5e6, 31.7e6, 43.7e6),                # annual fixed cash costs
    preop=22.5e6,                                  # Year 0 spending
    funding=42.0e6,
    lag=1,                                         # months receivables lag
    tax=0.20,
)

def run(p=BASE, rate=0.25, g=0.03):
    p = dict(BASE, **p) if p is not BASE else dict(BASE)
    months = []
    active = 0.0
    revenue_hist = []
    cash = p["funding"] - p["preop"]
    min_cash, min_m = cash, 0
    for m in range(1, 37):
        y = (m - 1) // 12
        if m == 1:
            new = p["pilots"]
        else:
            new = p["adds"][y]
        churned = active * p["churn"]
        active = active - churned + new
        passports = active * p["ppm"]
        rev = active * p["sub"] + passports * p["fee"]
        if m <= p.get("free_months", 2):  # free pilot for the first 5 shops
            rev -= min(active, p["pilots"]) * (p["sub"] + p["ppm"] * p["fee"])
        var = passports * p["var"]
        fixed = p["fixed"][y] / 12
        revenue_hist.append(rev)
        collected = revenue_hist[m - 1 - p["lag"]] if m - 1 - p["lag"] >= 0 else 0.0
        op_cash = collected - var - fixed
        months.append(dict(m=m, new=new, churned=churned, active=active, passports=passports,
                           rev=rev, collected=collected, var=var, fixed=fixed, op_profit=rev - var - fixed,
                           op_cash=op_cash))
    # annual + tax with loss carry-forward (pre-op expensed in Year 0)
    years = []
    loss_cf = p["preop"]
    for y in range(3):
        ms = months[12 * y:12 * y + 12]
        rev = sum(x["rev"] for x in ms); var = sum(x["var"] for x in ms)
        fixed = p["fixed"][y]; ebit = rev - var - fixed
        taxable = ebit - loss_cf
        if taxable > 0:
            tax = taxable * p["tax"]; loss_cf = 0
        else:
            tax = 0; loss_cf = -taxable if ebit < loss_cf else 0
            loss_cf = max(loss_cf, 0)
        collected = sum(x["collected"] for x in ms)
        receivable_end = ms[-1]["rev"] * p["lag"]  # one month outstanding
        cfo = collected - var - fixed - tax
        years.append(dict(year=y + 1, avg_shops=sum(x["active"] for x in ms) / 12, end_shops=ms[-1]["active"],
                          new=sum(x["new"] for x in ms), churned=sum(x["churned"] for x in ms),
                          passports=sum(x["passports"] for x in ms),
                          sub_rev=sum(x["active"] for x in ms) * p["sub"],
                          pass_rev=sum(x["passports"] for x in ms) * p["fee"],
                          rev=rev, var=var, contrib=rev - var, fixed=fixed, ebit=ebit, tax=tax,
                          net=ebit - tax, collected=collected, receivable_end=receivable_end, cfo=cfo))
    # monthly cash with tax paid at year end month
    cash = p["funding"] - p["preop"]; min_cash, min_m = cash, 0
    cum_project = -p["preop"]; payback_m = None
    for x in months:
        y = (x["m"] - 1) // 12
        t = years[y]["tax"] if x["m"] % 12 == 0 else 0
        cf = x["op_cash"] - t
        cash += cf; x["cash"] = cash
        prev = cum_project; cum_project += cf; x["cum_project"] = cum_project
        if payback_m is None and cum_project >= 0:
            payback_m = x["m"] - 1 + (-prev) / cf
        if cash < min_cash: min_cash, min_m = cash, x["m"]
    cfs = [-p["preop"]] + [yy["cfo"] for yy in years]
    df = [1 / (1 + rate) ** t for t in range(4)]
    pv = [c * d for c, d in zip(cfs, df)]
    npv = sum(pv)
    tv = cfs[3] * (1 + g) / (rate - g) if cfs[3] > 0 else 0
    pv_tv = tv * df[3]
    # IRR (3-year)
    def f(r): return sum(c / (1 + r) ** t for t, c in enumerate(cfs))
    irr = None
    lo, hi = -0.99, 5
    if f(lo) * f(hi) < 0:
        for _ in range(200):
            mid = (lo + hi) / 2
            if f(lo) * f(mid) <= 0: hi = mid
            else: lo = mid
        irr = mid
    # funding need: peak deficit relative to zero cash
    need_reserve = max(0.0, -(min_cash - (p["funding"] - p["preop"])))
    # break-even shops at Year 2 fixed costs (annual contribution per shop)
    contrib_shop = 12 * (p["sub"] + p["ppm"] * (p["fee"] - p["var"]))
    be = [p["fixed"][y] / contrib_shop for y in range(3)]
    return dict(p=p, months=months, years=years, cfs=cfs, df=df, pv=pv, npv=npv, tv=tv, pv_tv=pv_tv,
                total_npv=npv + pv_tv, irr=irr, min_cash=min_cash, min_m=min_m, payback_m=payback_m,
                peak_reserve_needed=need_reserve, contrib_shop=contrib_shop, be=be)

def summary(r, name):
    print(f"\n### {name}")
    for y in r["years"]:
        print({k: (round(v / 1e6, 2) if isinstance(v, float) and abs(v) > 1e4 else round(v, 2)) for k, v in y.items()})
    print("CFs", [round(c / 1e6, 2) for c in r["cfs"]], "PV", [round(c / 1e6, 2) for c in r["pv"]])
    print("NPV", round(r["npv"] / 1e6, 2), "TV", round(r["tv"] / 1e6, 1), "PV TV", round(r["pv_tv"] / 1e6, 1),
          "total", round(r["total_npv"] / 1e6, 1), "IRR", r["irr"] and round(r["irr"] * 100, 1))
    print("min cash", round(r["min_cash"] / 1e6, 3), "month", r["min_m"], "payback month", r["payback_m"] and round(r["payback_m"], 1),
          "reserve needed", round(r["peak_reserve_needed"] / 1e6, 2), "BE shops", [round(b, 1) for b in r["be"]])

if __name__ == "__main__":
    base = run()
    summary(base, "BASE")
    for name, ch in [("fewer shops -30% adds", dict(adds=(2.1, 2.8, 4.2), pilots=5)),
                     ("fixed +15%", dict(fixed=tuple(f * 1.15 for f in BASE["fixed"]))),
                     ("usage 60/month", dict(ppm=60)),
                     ("combined: -30% adds & +15% fixed", dict(adds=(2.1, 2.8, 4.2), fixed=tuple(f * 1.15 for f in BASE["fixed"])))]:
        summary(run(ch), name)
