"""Dataset generation with a full audit trail. Two backends:
  pr        Peng-Robinson EOS (always available; used for the published results of this build)
  coolprop  CoolProp HEOS reference equations (requires `pip install CoolProp`; NOT executed in the build
            environment of this repository, see README)."""
import math
import numpy as np, pandas as pd
from . import SEED
from .fluids import FLUIDS
from . import eos_pr

TR_RANGE, PR_RANGE = (0.6, 1.6), (0.03, 3.0)
COLS = ["fluid", "fluid_id", "Tr", "Pr", "omega", "Z", "ar", "hr", "sr", "gr", "lnphi", "phase"]

def _coolprop_row(AS, CP, Tr, Pr, guard):
    Tc, Pc = AS.T_critical(), AS.p_critical(); T, P = Tr * Tc, Pr * Pc
    if Tr < 1 and Pr < 1:
        AS.update(CP.QT_INPUTS, 0.0, T); ps = AS.p()
        if abs(math.log(P / ps)) < guard: return None, "saturation_guard"
    AS.update(CP.PT_INPUTS, P, T); R = AS.gas_constant(); Z = AS.compressibility_factor()
    hr = AS.hmolar_residual() / (R * T); sr = AS.smolar_residual() / R; gr = hr - sr
    ph = AS.phase()
    if ph == CP.iphase_gas: lab = 0
    elif ph == CP.iphase_liquid: lab = 1
    elif ph in (CP.iphase_supercritical, CP.iphase_supercritical_gas, CP.iphase_supercritical_liquid): lab = 2
    else: return None, "ambiguous_phase"  # two-phase or critical point
    return dict(Z=Z, ar=AS.alphar(), hr=hr, sr=sr, gr=gr, lnphi=gr - math.log(Z), phase=lab), None

def generate(backend="pr", n_per=470, seed=SEED, guard=0.02):
    """Sample n_per states per fluid: Tr uniform, Pr log-uniform. Returns (DataFrame, audit dict)."""
    rng = np.random.default_rng(seed); rows = []; rej = {"saturation_guard": 0, "invalid_state": 0, "ambiguous_phase": 0, "backend_error": 0}
    CP = AS = None
    if backend == "coolprop":
        import CoolProp, CoolProp.CoolProp as CP  # noqa
    for fid, (name, Tc, Pc, w, cpname) in enumerate(FLUIDS):
        if backend == "coolprop":
            AS = CP.AbstractState("HEOS", cpname); w = AS.acentric_factor()
        for _ in range(n_per):
            Tr = rng.uniform(*TR_RANGE); Pr = math.exp(rng.uniform(math.log(PR_RANGE[0]), math.log(PR_RANGE[1])))
            try:
                if backend == "coolprop":
                    st, why = _coolprop_row(AS, CP, Tr, Pr, guard)
                    if st is None: rej[why] += 1; continue
                else:
                    if Tr < 1 and Pr < 1 and abs(math.log(Pr / eos_pr.psat_r(Tr, w))) < guard: rej["saturation_guard"] += 1; continue
                    st = eos_pr.state(Tr, Pr, w); st = dict(st, phase=eos_pr.phase(Tr, Pr, w))
            except Exception:
                rej["backend_error" if backend == "coolprop" else "invalid_state"] += 1; continue
            if not all(math.isfinite(st[k]) for k in ("Z", "ar", "hr", "sr", "gr", "lnphi")): rej["invalid_state"] += 1; continue
            rows.append(dict(fluid=name, fluid_id=fid, Tr=Tr, Pr=Pr, omega=w, **st))
    df = pd.DataFrame(rows, columns=COLS)
    dup = int(df.duplicated(subset=["fluid_id", "Tr", "Pr"]).sum()); df = df.drop_duplicates(subset=["fluid_id", "Tr", "Pr"]).reset_index(drop=True)
    version = "Peng-Robinson (1976), thermoscope.eos_pr"
    if backend == "coolprop": version = "CoolProp " + CoolProp.__version__ + " (HEOS backend)"
    audit = dict(backend=backend, backend_version=version, seed=seed, n_fluids=len(FLUIDS), requested=n_per * len(FLUIDS), valid=len(df), rejected=rej,
                 duplicates_removed=dup, missing_values=int(df.isna().sum().sum()), guard_band=guard, tr_range=TR_RANGE, pr_range=PR_RANGE,
                 sampling="per fluid: Tr ~ Uniform, ln Pr ~ Uniform; states with |ln(Pr/Psat)| < guard_band excluded")
    return df, audit
