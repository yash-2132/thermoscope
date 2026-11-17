"""Peng-Robinson (1976) equation of state in reduced variables.

Residual properties follow the CoolProp / Helmholtz convention: residual = real fluid minus ideal gas at the
SAME TEMPERATURE AND DENSITY, made dimensionless:
    ar = a^r/(RT) = alpha^r,  hr = h^r/(RT),  sr = s^r/R,  gr = g^r/(RT) = hr - sr = ar + Z - 1.
lnphi (fugacity coefficient) = gr - ln Z is the residual Gibbs energy at the same T and PRESSURE; it is
continuous across the saturation line and is used to pick the stable root and as an ablation target."""
import math
import numpy as np
S2 = math.sqrt(2.0)
PHASES = ["vapour", "liquid", "supercritical"]

def roots(Tr, Pr, w):
    kap = 0.37464 + 1.54226 * w - 0.26992 * w * w
    sa = 1 + kap * (1 - math.sqrt(Tr)); al = sa * sa
    A = 0.45724 * al * Pr / Tr ** 2; B = 0.07780 * Pr / Tr; D = -kap * math.sqrt(Tr) / sa
    r = np.roots([1, -(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B ** 3)])
    out = []
    for Z in sorted(x.real for x in r if abs(x.imag) < 1e-9 and x.real > B):
        L = math.log((Z + (1 + S2) * B) / (Z + (1 - S2) * B))
        lnphi = Z - 1 - math.log(Z - B) - A / (2 * S2 * B) * L
        hr = Z - 1 + (A / B) * (D - 1) / (2 * S2) * L
        gr = lnphi + math.log(Z); sr = hr - gr
        out.append(dict(Z=Z, ar=gr - (Z - 1), hr=hr, sr=sr, gr=gr, lnphi=lnphi))
    return out

def psat_r(Tr, w):
    """Reduced saturation pressure from equal fugacity of the liquid and vapour roots (Tr < 1)."""
    lo, hi = 1e-8, 1.0
    for _ in range(70):
        P = math.sqrt(lo * hi); r = roots(Tr, P, w)
        if len(r) < 2:
            if r[0]["Z"] < 0.3 and P > 1e-3: hi = P
            else: lo = P
            continue
        if r[0]["lnphi"] - r[-1]["lnphi"] > 0: lo = P
        else: hi = P
    return math.sqrt(lo * hi)

def phase(Tr, Pr, w):
    """CoolProp phase regions grouped into three classes: gas -> 0 vapour; liquid -> 1 liquid;
    supercritical, supercritical_gas (T>Tc, P<Pc) and supercritical_liquid (T<Tc, P>Pc) -> 2 supercritical."""
    if Tr >= 1 or Pr >= 1: return 2
    return 1 if Pr > psat_r(Tr, w) else 0

def state(Tr, Pr, w):
    r = roots(Tr, Pr, w)
    if not r: raise ValueError("no physical root")
    return min(r, key=lambda x: x["lnphi"])
