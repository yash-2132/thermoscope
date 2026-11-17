"""Fluid list. Tc [K], Pc [MPa] and acentric factor are standard reference values (NIST Chemistry WebBook;
Poling, Prausnitz & O'Connell, The Properties of Gases and Liquids, 5th ed.). They are used only by the
Peng-Robinson backend; the CoolProp backend reads its own constants from the library.
`coolprop` is the CoolProp fluid name used by the HEOS backend."""
FLUIDS = [
    ("Methane", 190.56, 4.599, 0.0114, "Methane"), ("Ethane", 305.32, 4.872, 0.0995, "Ethane"), ("Propane", 369.89, 4.251, 0.1521, "n-Propane"),
    ("n-Butane", 425.13, 3.796, 0.2002, "n-Butane"), ("Isobutane", 407.81, 3.629, 0.184, "IsoButane"), ("n-Pentane", 469.70, 3.370, 0.251, "n-Pentane"),
    ("n-Hexane", 507.82, 3.034, 0.299, "n-Hexane"), ("n-Heptane", 540.13, 2.736, 0.349, "n-Heptane"), ("n-Octane", 569.32, 2.497, 0.395, "n-Octane"),
    ("Ethylene", 282.35, 5.042, 0.0866, "Ethylene"), ("Propylene", 364.21, 4.555, 0.146, "Propylene"), ("Nitrogen", 126.19, 3.396, 0.0372, "Nitrogen"),
    ("Oxygen", 154.58, 5.043, 0.0222, "Oxygen"), ("Argon", 150.69, 4.863, -0.0022, "Argon"), ("Carbon dioxide", 304.13, 7.377, 0.2239, "CarbonDioxide"),
    ("Ammonia", 405.40, 11.333, 0.2526, "Ammonia"), ("Water", 647.10, 22.064, 0.3443, "Water"), ("R-134a", 374.21, 4.059, 0.3268, "R134a"),
    ("Benzene", 562.02, 4.907, 0.2103, "Benzene"), ("Hydrogen sulfide", 373.10, 9.000, 0.1005, "HydrogenSulfide"),
    ("Carbon monoxide", 132.86, 3.494, 0.0497, "CarbonMonoxide"), ("Sulfur dioxide", 430.64, 7.884, 0.2557, "SulfurDioxide"),
]
