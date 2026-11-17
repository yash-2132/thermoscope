"""Automated checks. Run after `python -m thermoscope.run`:  PYTHONPATH=src pytest -q"""
import json, math, os
import numpy as np, pandas as pd, pytest
from sklearn.preprocessing import PolynomialFeatures
from thermoscope import eos_pr, experiments
ROOT = os.path.join(os.path.dirname(__file__), "..")
out = lambda n: os.path.join(ROOT, "outputs", n)

@pytest.fixture(scope="module")
def df(): return pd.read_csv(out("dataset.csv"))
@pytest.fixture(scope="module")
def web(): return json.loads(open(os.path.join(ROOT, "docs", "data", "data.js")).read()[len("window.DATA="):-1])

def test_no_fluid_in_both_train_and_test(df):
    assert not set(df[df.split == "train"].fluid) & set(df[df.split == "test"].fluid)
def test_test_share_is_about_twenty_percent(df):
    assert 0.15 <= df[df.split == "test"].fluid.nunique() / df.fluid.nunique() <= 0.3
def test_folds_are_grouped_by_fluid(df):
    tr = df[df.split == "train"]; assert sorted(tr.cv_fold.unique()) == [0, 1, 2, 3, 4]
    assert (tr.groupby("fluid").cv_fold.nunique() == 1).all() and (df[df.split == "test"].cv_fold == -1).all()
def test_dataset_is_clean_and_matches_audit(df):
    a = json.load(open(out("dataset_audit.json")))
    assert len(df) == a["valid"] and df.isna().sum().sum() == 0 and not df.duplicated(["fluid", "Tr", "Pr"]).any()
    assert a["requested"] == a["valid"] + sum(a["rejected"].values()) + a["duplicates_removed"]
    assert df.Tr.between(0.6, 1.6).all() and df.Pr.between(0.03, 3.0).all()
def test_residual_identities(df):
    assert np.allclose(df.gr, df.hr - df.sr, atol=1e-6) and np.allclose(df.ar, df.gr - (df.Z - 1), atol=1e-6)
    assert np.allclose(df.lnphi, df.gr - np.log(df.Z), atol=1e-6)
def test_phase_regions(df):
    assert (df[(df.Tr >= 1) | (df.Pr >= 1)].phase == 2).all() and (df[(df.Tr < 1) & (df.Pr < 1)].phase != 2).all()
def test_pr_ideal_gas_limit_and_equal_fugacity():
    assert abs(eos_pr.state(1.5, 1e-4, 0.1)["Z"] - 1) < 1e-3
    ps = eos_pr.psat_r(0.8, 0.15); r = eos_pr.roots(0.8, ps, 0.15); assert len(r) == 3 and abs(r[0]["lnphi"] - r[-1]["lnphi"]) < 1e-6
def test_scaler_fitted_on_training_rows_only(df, web):
    X = df[["Tr", "Pr", "omega"]].values; P = PolynomialFeatures(web["reg"]["degree"], include_bias=False)
    tr = P.fit_transform(X[(df.split == "train").values]); full = P.fit_transform(X)
    assert np.allclose(tr.mean(0), web["reg"]["mean"], rtol=1e-8) and np.allclose(tr.std(0), web["reg"]["scale"], rtol=1e-8)
    assert not np.allclose(full.mean(0), web["reg"]["mean"], rtol=1e-8)  # i.e. test rows did not contribute
def test_reported_metrics_match_exported_predictions():
    p = pd.read_csv(out("predictions_test.csv")); m = json.load(open(out("metrics_regression.json")))
    for t in experiments.TARGETS:
        for k in ("ols", "ridge", "lasso"):
            assert math.isclose(float(np.sqrt(((p[t] - p["pred_%s_%s" % (t, k)]) ** 2).mean())), m["targets"][t][k]["test"]["rmse"], rel_tol=1e-4)
    c = json.load(open(out("metrics_classification.json")))
    for k in ("lr", "svm"): assert math.isclose((p.phase == p["pred_phase_" + k]).mean(), c[k]["test"]["acc"], rel_tol=1e-9)
def test_exported_ridge_coefficients_reproduce_test_error(df, web):
    g = web["reg"]; te = df[df.split == "test"]; F = PolynomialFeatures(g["degree"], include_bias=False).fit_transform(te[["Tr", "Pr", "omega"]].values)
    m = g["targets"]["Z"]["ridge"]; pred = ((F - g["mean"]) / g["scale"]) @ np.array(m["coef"]) + m["intercept"]
    assert math.isclose(float(np.sqrt(((te.Z - pred) ** 2).mean())), m["test"]["rmse"], rel_tol=1e-6)
def test_hyperparameters_selected_inside_search_space(web):
    s = web["meta"]["search"]; assert web["cls"]["svm"]["C"] in s["svm_C"] and web["cls"]["svm"]["gamma"] in s["svm_gamma"] and web["cls"]["lr"]["C"] in s["lr_C"]
    assert any(math.isclose(web["reg"]["targets"]["Z"]["ridge"]["lam"], v, rel_tol=1e-9) for v in s["ridge"])
