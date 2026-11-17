"""All experiments: grouped split, grouped cross-validation, model selection, final fits, test evaluation, ablations.
The locked test fluids are touched only in the functions whose names end in `_test` and in final reporting."""
import math, warnings
import numpy as np
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.linear_model import LinearRegression, Ridge, Lasso, LogisticRegression
from sklearn.dummy import DummyClassifier
from sklearn.svm import SVC
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import GroupKFold, KFold, GroupShuffleSplit, StratifiedKFold, cross_val_predict, cross_val_score, train_test_split
from sklearn.metrics import (confusion_matrix, precision_recall_fscore_support, f1_score, balanced_accuracy_score, roc_curve, roc_auc_score,
                             mean_squared_error, mean_absolute_error, r2_score)
from . import SEED
from . import dataset as ds
warnings.filterwarnings("ignore")

TARGETS = ["Z", "ar", "hr", "sr", "gr", "lnphi"]
RIDGE_GRID = np.logspace(-6, 3, 19); LASSO_GRID = np.logspace(-5, -2, 10); DEGREES = [1, 2, 3, 4, 5]
LR_C = [0.1, 1, 10, 100, 1000]; SVM_C = [1, 10, 100, 1000]; SVM_GAMMA = [0.1, 0.3, 1, 3, 10]
rmse = lambda a, b: float(np.sqrt(mean_squared_error(a, b)))
regm = lambda y, p: dict(rmse=rmse(y, p), mae=float(mean_absolute_error(y, p)), r2=float(r2_score(y, p)))

def reg_pipe(kind, deg, lam=None):
    est = LinearRegression() if kind == "ols" else Ridge(alpha=lam) if kind == "ridge" else Lasso(alpha=lam, max_iter=20000, tol=1e-4)
    return make_pipeline(PolynomialFeatures(deg, include_bias=False), StandardScaler(), est)

def cls_features(X):  # fixed physical transformation: pressure enters through its logarithm
    return np.c_[X[:, 0], np.log(X[:, 1]), X[:, 2]]

def split(df):
    """Primary design: 80/20 split by fluid; five-fold GroupKFold inside the training fluids."""
    X = df[["Tr", "Pr", "omega"]].values; g = df["fluid_id"].values
    tr, te = next(GroupShuffleSplit(1, test_size=0.2, random_state=SEED).split(X, groups=g))
    fold = -np.ones(len(df), int)
    for k, (_, va) in enumerate(GroupKFold(5).split(X[tr], groups=g[tr])): fold[tr[va]] = k
    assert not set(g[tr]) & set(g[te]), "a fluid appears in both train and test"
    for k in range(5): assert not set(g[tr][fold[tr] == k]) & set(g[tr][fold[tr] != k]), "a fluid appears in two folds"
    return tr, te, fold

def run(df, log=print):
    X = df[["Tr", "Pr", "omega"]].values; g = df["fluid_id"].values; ph = df["phase"].values
    tr, te, fold = split(df); Xtr, Xte = X[tr], X[te]; ftr = fold[tr]
    folds = [(np.where(ftr != k)[0], np.where(ftr == k)[0]) for k in range(5)]
    def cv(kind, deg, lam, y, splits=folds):
        return float(np.mean([rmse(y[va], reg_pipe(kind, deg, lam).fit(Xtr[a], y[a]).predict(Xtr[va])) for a, va in splits]))
    out = dict(cv_rows=[]); yZ = df["Z"].values[tr]; cvtab = []
    for d in DEGREES:  # degree selection on Z with OLS and Ridge
        r = [cv("ridge", d, l, yZ) for l in RIDGE_GRID]; o = cv("ols", d, None, yZ)
        for l, v in zip(RIDGE_GRID, r): out["cv_rows"].append(dict(target="Z", degree=d, model="ridge", penalty=float(l), cv_rmse=v))
        out["cv_rows"].append(dict(target="Z", degree=d, model="ols", penalty=0.0, cv_rmse=o))
        cvtab.append(dict(deg=d, p=int(PolynomialFeatures(d, include_bias=False).fit(Xtr).n_output_features_), ols=o, ridge=min(r), ridgeLam=float(RIDGE_GRID[int(np.argmin(r))]))); log(cvtab[-1])
    DEG = min(cvtab, key=lambda t: t["ridge"])["deg"]
    la = [cv("lasso", DEG, l, yZ) for l in LASSO_GRID]; cvtab[DEG - 1].update(lasso=min(la), lassoAlpha=float(LASSO_GRID[int(np.argmin(la))]))
    pf = PolynomialFeatures(DEG, include_bias=False).fit(Xtr); sc = StandardScaler().fit(pf.transform(Xtr))
    reg = dict(degree=DEG, powers=pf.powers_.tolist(), mean=sc.mean_.tolist(), scale=sc.scale_.tolist(), targets={}); preds = {}
    for t in TARGETS:
        y = df[t].values; ytr, yte = y[tr], y[te]
        r = [cv("ridge", DEG, l, ytr) for l in RIDGE_GRID]; la = [cv("lasso", DEG, l, ytr) for l in LASSO_GRID]
        for l, v in zip(RIDGE_GRID, r): out["cv_rows"].append(dict(target=t, degree=DEG, model="ridge", penalty=float(l), cv_rmse=v))
        for l, v in zip(LASSO_GRID, la): out["cv_rows"].append(dict(target=t, degree=DEG, model="lasso", penalty=float(l), cv_rmse=v))
        mean = float(ytr.mean()); T = dict(base=dict(pred=mean, cv=float(np.mean([rmse(ytr[va], np.full(len(va), ytr[a].mean())) for a, va in folds])), test=regm(yte, np.full_like(yte, mean))))
        lin = reg_pipe("ols", 1).fit(Xtr, ytr); T["linear"] = dict(cv=cv("ols", 1, None, ytr), test=regm(yte, lin.predict(Xte)), coef=[float(c) for c in lin[-1].coef_], intercept=float(lin[-1].intercept_), mean=lin[1].mean_.tolist(), scale=lin[1].scale_.tolist())
        for kind, lam, cvv in (("ols", None, cv("ols", DEG, None, ytr)), ("ridge", float(RIDGE_GRID[int(np.argmin(r))]), min(r)), ("lasso", float(LASSO_GRID[int(np.argmin(la))]), min(la))):
            m = reg_pipe(kind, DEG, lam).fit(Xtr, ytr); p = m.predict(Xte); e = m[-1]; preds[t + "_" + kind] = p
            T[kind] = dict(lam=lam, cv=cvv, coef=[float(x) for x in e.coef_], intercept=float(e.intercept_), nnz=int(np.sum(np.abs(e.coef_) > 1e-10)), test=regm(yte, p), train_rmse=rmse(ytr, m.predict(Xtr)))
        reg["targets"][t] = T; log(t, {k: round(T[k]["test"]["rmse"], 4) for k in ("base", "linear", "ols", "ridge", "lasso")})
    lamZ = reg["targets"]["Z"]["ridge"]["lam"]
    # ---- classification ----
    Ctr, Cte, ptr, pte = cls_features(Xtr), cls_features(Xte), ph[tr], ph[te]
    def f1cv(mk): return float(np.mean([f1_score(ptr[va], mk().fit(Ctr[a], ptr[a]).predict(Ctr[va]), average="macro") for a, va in folds]))
    lrC = {c: f1cv(lambda c=c: make_pipeline(StandardScaler(), LogisticRegression(C=c, max_iter=5000))) for c in LR_C}; bestC = max(lrC, key=lrC.get)
    grid = [[f1cv(lambda c=c, q=q: make_pipeline(StandardScaler(), SVC(C=c, gamma=q))) for q in SVM_GAMMA] for c in SVM_C]
    bi = int(np.argmax(grid)); bC, bG = SVM_C[bi // len(SVM_GAMMA)], SVM_GAMMA[bi % len(SVM_GAMMA)]; log("LR C", bestC, "SVM", bC, bG)
    mk_lr = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=bestC, max_iter=5000))
    mk_sv = lambda: make_pipeline(StandardScaler(), SVC(C=bC, gamma=bG, probability=True, random_state=SEED))
    lr, svm = mk_lr().fit(Ctr, ptr), mk_sv().fit(Ctr, ptr); maj = DummyClassifier(strategy="most_frequent").fit(Ctr, ptr)
    def evalc(m, proba=True):
        p = m.predict(Cte); P, Rc, F, Sp = precision_recall_fscore_support(pte, p, labels=[0, 1, 2], zero_division=0)
        d = dict(cm=confusion_matrix(pte, p, labels=[0, 1, 2]).tolist(), precision=P.tolist(), recall=Rc.tolist(), f1=F.tolist(), support=Sp.tolist(), macroF1=float(F.mean()), balAcc=float(balanced_accuracy_score(pte, p)), acc=float((p == pte).mean()), pred=p.tolist())
        if proba:
            pr = m.predict_proba(Cte); d["roc"] = []
            for k in range(3):
                f, t, _ = roc_curve(pte == k, pr[:, k]); ii = np.unique(np.round(np.linspace(0, len(f) - 1, 80)).astype(int))
                d["roc"].append(dict(fpr=[round(float(x), 4) for x in f[ii]], tpr=[round(float(x), 4) for x in t[ii]], auc=float(roc_auc_score(pte == k, pr[:, k]))))
            pl = pr[:, 1]; d["pliq"] = [round(float(x), 4) for x in pl]; d["calib"] = []
            for b in range(10):
                msk = (pl >= b / 10) & ((pl < (b + 1) / 10) if b < 9 else (pl <= 1))
                if msk.sum(): d["calib"].append([float(pl[msk].mean()), float((pte[msk] == 1).mean()), int(msk.sum())])
        return d
    tlr, tsv, tmaj = evalc(lr), evalc(svm), evalc(maj, False)
    oof_lr = cross_val_predict(mk_lr(), Ctr, ptr, cv=folds, method="predict_proba")[:, 1]; oof_sv = cross_val_predict(mk_sv(), Ctr, ptr, cv=folds, method="predict_proba")[:, 1]
    sv, cs, ls, le = svm[-1], svm[0], lr[0], lr[-1]
    cls = dict(majority=dict(cls=int(maj.classes_[np.argmax(maj.class_prior_)]), test=tmaj, cvF1=f1cv(lambda: DummyClassifier(strategy="most_frequent"))),
               lr=dict(C=bestC, cvF1={str(k): v for k, v in lrC.items()}, mean=ls.mean_.tolist(), scale=ls.scale_.tolist(), coef=le.coef_.tolist(), intercept=le.intercept_.tolist(), test=tlr, calib=tlr.pop("calib")),
               svm=dict(C=bC, gamma=bG, Cs=SVM_C, gammas=SVM_GAMMA, cvGrid=grid, mean=cs.mean_.tolist(), scale=cs.scale_.tolist(), sv=sv.support_vectors_.tolist(), dual=sv.dual_coef_.tolist(), intercept=sv.intercept_.tolist(), nsv=sv.n_support_.tolist(), test=tsv, calib=tsv.pop("calib")),
               oof=dict(y=(ptr == 1).astype(int).tolist(), lr=[round(float(x), 4) for x in oof_lr], svm=[round(float(x), 4) for x in oof_sv]))
    preds["phase_lr"], preds["phase_svm"] = np.array(tlr["pred"]), np.array(tsv["pred"])
    # ---- 2D teaching SVMs (one training fluid, Liquid vs Not liquid) ----
    from . import eos_pr
    from .fluids import FLUIDS
    train_ids = sorted(set(g[tr])); tf = next((i for i in train_ids if FLUIDS[i][0] == "Propane"), train_ids[0]); w = float(df.loc[df.fluid_id == tf, "omega"].iloc[0])
    r2 = np.random.default_rng(SEED + 1); pts = []
    while len(pts) < 360:
        Tr = r2.uniform(0.6, 1.6); Pr = math.exp(r2.uniform(math.log(0.03), math.log(3.0)))
        if Tr < 1 and Pr < 1 and abs(math.log(Pr / eos_pr.psat_r(Tr, w))) < 0.02: continue
        pts.append((Tr, Pr, eos_pr.phase(Tr, Pr, w)))
    pts = np.array(pts); U = np.c_[(pts[:, 0] - 1.1) / 0.5, (np.log(pts[:, 1]) - math.log(0.3)) / math.log(10)]; yb = (pts[:, 2] == 1).astype(int); models = []
    for C in [0.1, 1, 10, 100, 1000]:
        for q in [0.1, 1, 10, 100]:
            m = SVC(C=C, gamma=q).fit(U, yb)
            models.append(dict(C=C, gamma=q, idx=m.support_.tolist(), dual=[round(float(x), 5) for x in m.dual_coef_[0]], b=float(m.intercept_[0]), train=float(m.score(U, yb)), cv=float(cross_val_score(SVC(C=C, gamma=q), U, yb, cv=StratifiedKFold(5, shuffle=True, random_state=SEED)).mean())))
    lin2 = LogisticRegression(C=100, max_iter=5000).fit(U, yb)
    teach = dict(fluid=int(tf), Tr=np.round(pts[:, 0], 5).tolist(), Pr=np.round(pts[:, 1], 5).tolist(), y=yb.tolist(), models=models, logit=dict(coef=lin2.coef_[0].tolist(), b=float(lin2.intercept_[0]), train=float(lin2.score(U, yb))))
    # ---- extra experiments / ablations (training fluids only unless stated) ----
    abl = {}
    rk = list(KFold(5, shuffle=True, random_state=SEED).split(Xtr)); abl["cv_grouped_vs_rowwise"] = dict(group=cv("ridge", DEG, lamZ, yZ), random=cv("ridge", DEG, lamZ, yZ, rk))
    # secondary experiment: row-wise 80/20 split of ALL rows (interpolation within known fluids); reported separately from the primary result
    a, b = train_test_split(np.arange(len(df)), test_size=0.2, random_state=SEED, stratify=ph); yall = df["Z"].values; Call = cls_features(X)
    abl["rowwise_secondary"] = dict(ridge_Z=regm(yall[b], reg_pipe("ridge", DEG, lamZ).fit(X[a], yall[a]).predict(X[b])), svm_macroF1=float(f1_score(ph[b], make_pipeline(StandardScaler(), SVC(C=bC, gamma=bG)).fit(Call[a], ph[a]).predict(Call[b]), average="macro")), n_test=int(len(b)))
    # extrapolation in omega: train on fluids with omega < 0.25, evaluate on training fluids with omega >= 0.25 (test fluids excluded)
    wtr = Xtr[:, 2]; lo, hi = np.where(wtr < 0.25)[0], np.where(wtr >= 0.25)[0]
    abl["omega_extrapolation"] = dict(threshold=0.25, n_train=int(len(lo)), n_eval=int(len(hi)), ridge_Z=regm(yZ[hi], reg_pipe("ridge", DEG, lamZ).fit(Xtr[lo], yZ[lo]).predict(Xtr[hi])), svm_macroF1=float(f1_score(ptr[hi], make_pipeline(StandardScaler(), SVC(C=bC, gamma=bG)).fit(Ctr[lo], ptr[lo]).predict(Ctr[hi]), average="macro")))
    # saturation guard-band sensitivity: regenerate the data with other guard widths and repeat the grouped CV of the selected classifiers
    gb = []
    for gd in (0.0, 0.02, 0.05):
        d2, a2 = ds.generate(df.attrs.get("backend", "pr"), df.attrs.get("n_per", 470), SEED, gd); t2 = d2[~d2.fluid_id.isin(set(g[te]))]; X2 = cls_features(t2[["Tr", "Pr", "omega"]].values); p2 = t2["phase"].values
        sp = list(GroupKFold(5).split(X2, groups=t2["fluid_id"].values)); f = lambda mk: float(np.mean([f1_score(p2[va], mk().fit(X2[q], p2[q]).predict(X2[va]), average="macro") for q, va in sp]))
        gb.append(dict(guard=gd, rows=int(a2["valid"]), rejected=int(a2["rejected"]["saturation_guard"]), svm=f(lambda: make_pipeline(StandardScaler(), SVC(C=bC, gamma=bG))), lr=f(lambda: make_pipeline(StandardScaler(), LogisticRegression(C=bestC, max_iter=5000)))))
    abl["guard_band"] = gb
    # Gram diagnostics (training rows): condition numbers by degree and scaling
    gram = []
    for d in DEGREES:
        P = PolynomialFeatures(d, include_bias=False).fit_transform(Xtr); S = StandardScaler().fit_transform(P); R = np.c_[np.ones(len(P)), P]
        for nm, M in (("standardised", S), ("raw_with_intercept", R)):
            s = np.linalg.svd(M, compute_uv=False); gram.append(dict(degree=d, scaling=nm, p=int(M.shape[1]), sigma_max=float(s[0]), sigma_min=float(s[-1]), cond_X=float(s[0] / s[-1]), cond_G=float((s[0] / s[-1]) ** 2), rank=int(np.linalg.matrix_rank(M))))
    out.update(tr=tr, te=te, fold=fold, cvtab=cvtab, reg=reg, cls=cls, teach=teach, abl=abl, gram=gram, preds=preds,
               search=dict(degrees=DEGREES, ridge=RIDGE_GRID.tolist(), lasso=LASSO_GRID.tolist(), lr_C=LR_C, svm_C=SVM_C, svm_gamma=SVM_GAMMA))
    return out
