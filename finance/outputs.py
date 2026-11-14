# Educational simulation: all figures are invented planning assumptions (KZT).
import json
from model import run, BASE
sc = {
 "Base case": {},
 "A. 30% fewer new shops": dict(adds=(2.1, 2.8, 4.2)),
 "B. Fixed costs +15%": dict(fixed=tuple(f*1.15 for f in BASE["fixed"])),
 "C. Usage 60 passports/shop": dict(ppm=60),
 "D. A and B combined": dict(adds=(2.1, 2.8, 4.2), fixed=tuple(f*1.15 for f in BASE["fixed"])),
}
out = {}
for k, ch in sc.items():
    r = run(ch)
    cum = r["cfs"][0]; cums=[cum]
    for c in r["cfs"][1:]:
        cum += c; cums.append(cum)
    # payback in years with linear extrapolation into year 4 assuming year-3 CF repeats
    pb = None; c=r["cfs"][0]
    for t in range(1,4):
        if c + r["cfs"][t] >= 0 and pb is None:
            pb = t-1 + (-c)/r["cfs"][t]
        c += r["cfs"][t]
    if pb is None and r["cfs"][3] > 0:
        pb = 3 + (-c)/(r["cfs"][3]*1.03)
    reserve = r["p"]["funding"] - r["p"]["preop"]
    out[k] = dict(npv=r["npv"], total_npv=r["total_npv"], tv=r["tv"], pv_tv=r["pv_tv"], irr=r["irr"],
                  min_cash=r["min_cash"], min_m=r["min_m"], payback=pb, cums=cums, cfs=r["cfs"], pv=r["pv"],
                  extra_funding=max(0, -r["min_cash"]), years=r["years"], cash=[m["cash"] for m in r["months"]],
                  be=r["be"], contrib_shop=r["contrib_shop"])
    print(f"{k:32s} NPV {r['npv']/1e6:7.2f}  totNPV {r['total_npv']/1e6:7.1f}  min cash {r['min_cash']/1e6:6.2f} (m{r['min_m']})  "
          f"payback {pb and round(pb,2)}  extra {max(0,-r['min_cash'])/1e6:.2f}  cum3 {cums[3]/1e6:.2f}")
json.dump(out, open("model_out.json","w"), default=float)
b = run()
print("monthly base cash first 20:", [round(m['cash']/1e6,2) for m in b['months'][:20]])
print("ending cash Y1-3:", [round(b['months'][i]['cash']/1e6,2) for i in (11,23,35)])
print("active by month end Y:", [round(b['months'][i]['active'],1) for i in (0,11,23,35)])
print("df", [round(d,3) for d in b['df']])
