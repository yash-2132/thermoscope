"""Reproduce everything: python -m thermoscope.run [--backend pr|coolprop] [--n-per 470]
Writes outputs/ (evidence files) and docs/data/ (what the website reads)."""
import argparse, json, os, platform, sys, time
import numpy as np, pandas as pd, sklearn, scipy
from . import SEED, dataset, experiments
from .fluids import FLUIDS
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--backend", default="pr", choices=["pr", "coolprop"]); ap.add_argument("--n-per", type=int, default=470); ap.add_argument("--repo-url", default="")
    a = ap.parse_args(); out, web = os.path.join(ROOT, "outputs"), os.path.join(ROOT, "docs", "data"); os.makedirs(out, exist_ok=True); os.makedirs(web, exist_ok=True); t0 = time.time()
    df, audit = dataset.generate(a.backend, a.n_per, SEED, 0.02); df.attrs.update(backend=a.backend, n_per=a.n_per); print(audit)
    R = experiments.run(df); tr, te, fold = R["tr"], R["te"], R["fold"]
    df["split"] = "train"; df.loc[te, "split"] = "test"; df["cv_fold"] = fold
    df.to_csv(os.path.join(out, "dataset.csv"), index=False, float_format="%.8g"); df.to_csv(os.path.join(web, "dataset.csv"), index=False, float_format="%.8g")
    versions = dict(python=platform.python_version(), numpy=np.__version__, pandas=pd.__version__, scipy=scipy.__version__, scikit_learn=sklearn.__version__, backend=audit["backend_version"], seed=SEED, generated_utc=time.strftime("%Y-%m-%d %H:%M", time.gmtime()))
    fl = [dict(name=n, Tc=Tc, Pc=Pc, w=float(df.loc[df.fluid_id == i, "omega"].iloc[0]), test=bool((df.fluid_id[te] == i).any()), fold=int(df.loc[df.fluid_id == i, "cv_fold"].iloc[0]), n=int((df.fluid_id == i).sum())) for i, (n, Tc, Pc, w, _) in enumerate(FLUIDS)]
    J = lambda name, obj: json.dump(obj, open(os.path.join(out, name), "w"), indent=1)
    J("dataset_audit.json", audit); J("versions.json", versions); J("splits.json", dict(seed=SEED, design="GroupShuffleSplit(test_size=0.2) by fluid; GroupKFold(5) inside training fluids", test_fluids=[f["name"] for f in fl if f["test"]], folds={str(k + 1): [f["name"] for f in fl if not f["test"] and f["fold"] == k] for k in range(5)}))
    pd.DataFrame(R["cv_rows"]).to_csv(os.path.join(out, "cv_regression.csv"), index=False)
    pd.DataFrame([dict(model="svm_rbf", C=c, gamma=q, cv_macro_f1=R["cls"]["svm"]["cvGrid"][i][j]) for i, c in enumerate(experiments.SVM_C) for j, q in enumerate(experiments.SVM_GAMMA)] + [dict(model="logistic", C=float(c), gamma=None, cv_macro_f1=v) for c, v in R["cls"]["lr"]["cvF1"].items()]).to_csv(os.path.join(out, "cv_classification.csv"), index=False)
    strip = lambda d, drop: {k: v for k, v in d.items() if k not in drop}
    J("metrics_regression.json", dict(degree=R["reg"]["degree"], degree_selection=R["cvtab"], targets={t: {k: strip(v, ("coef", "mean", "scale")) for k, v in T.items()} for t, T in R["reg"]["targets"].items()}))
    J("metrics_classification.json", {k: strip(v, ("sv", "dual", "mean", "scale", "coef", "intercept")) | {"test": strip(v["test"], ("pred", "pliq", "roc"))} for k, v in R["cls"].items() if k != "oof"})
    J("ablations.json", R["abl"]); J("hyperparameter_search.json", R["search"]); pd.DataFrame(R["gram"]).to_csv(os.path.join(out, "gram_diagnostics.csv"), index=False)
    pt = df.iloc[te][["fluid", "Tr", "Pr", "omega", "phase"] + experiments.TARGETS].reset_index(drop=True)
    for k, v in R["preds"].items(): pt["pred_" + k] = v
    pt.to_csv(os.path.join(out, "predictions_test.csv"), index=False, float_format="%.6g")
    sig = lambda s, n=6: [float(("%." + str(n) + "g") % x) for x in s]
    D = dict(meta=dict(audit=audit, versions=versions, nper=a.n_per, repo=a.repo_url, search=R["search"], source=audit["backend_version"]), fluids=fl,
             rows=dict(fi=df.fluid_id.tolist(), Tr=sig(df.Tr), Pr=sig(df.Pr), Z=sig(df.Z, 8), hr=sig(df.hr, 8), sr=sig(df.sr, 8), lnphi=sig(df.lnphi, 8), ph=df.phase.tolist()),
             cvTable=R["cvtab"], reg=R["reg"], cls=R["cls"], teach=R["teach"], abl=R["abl"], gram=R["gram"], splitDemo=R["abl"]["cv_grouped_vs_rowwise"])
    open(os.path.join(web, "data.js"), "w").write("window.DATA=" + json.dumps(D, separators=(",", ":")) + ";")
    print("done in %.0f s; rows %d; test fluids %s" % (time.time() - t0, len(df), [f["name"] for f in fl if f["test"]]))

if __name__ == "__main__":
    main()
