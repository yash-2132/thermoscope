# AI-use disclosure

AI assistant used: Claude (Anthropic), through the Claude app.

## What we did

- Chose the topic and set the research question: can regularised regression and kernel methods accurately predict thermodynamic residual properties and classify fluid phases across a generalised reduced space?
- Defined the data design: reduced temperature, reduced pressure and acentric factor as the only inputs; Z and four residual properties as regression targets; vapour, liquid and supercritical as phase classes; CoolProp as the intended reference, with about 10,000 observations.
- Decided which models to compare (mean and linear baselines, OLS, Ridge, Lasso, majority-class baseline, logistic regression, RBF SVM) and which studies to include: Gram matrix conditioning, regularisation paths, kernel behaviour, and the Liquid-versus-Not-liquid cost analysis.
- Set the evaluation design: an 80/20 split by fluid, five-fold cross-validation grouped by fluid inside the training set, and a locked test set never used for tuning.
- Set what the website had to explain and its visual direction, reviewed each version, and asked for corrections and changes over several rounds.

## What Claude did

- Wrote all of the code: the Python pipeline in src/thermoscope (data generation, experiments, export), the tests, the notebooks and the website.
- Generated the dataset and ran all training, cross-validation and the final test evaluation, in its own sandbox environment.
- Used the Peng–Robinson equation of state instead of CoolProp, because CoolProp could not be installed in that environment. A CoolProp option was written but never run.
- Chose the 22 fluids and supplied their critical constants, acentric factors and the reference list from its own knowledge.
- Chose implementation details: search grids, the polynomial degree range, the 2 % saturation guard band and how residual properties are scaled. It proposed the extra experiments (the ln φ target, the row-wise split, extrapolation in ω, the guard-band sensitivity check).
- Designed the website layout and wrote most of the text on the site and in the documentation.

## What AI did not do

- It did not choose the research question, the model families or the evaluation design.
- No result on this site was typed in or estimated. Every number comes from running the pipeline code and can be regenerated with one command (see README).
- Note: the dataset itself was produced by code Claude wrote, from the Peng–Robinson equation; it is not a published dataset.

## How the work was checked

- Automated tests (11, in tests/): no fluid appears in both training and test; folds are grouped by fluid; the feature scaler is fitted on training rows only; thermodynamic identities hold; reported metrics are recomputed from the saved predictions.
- The website’s own calculations were compared with the Python results: test errors, cross-validation errors and all 2,345 test-set phase predictions match.
- Every website section was loaded in an automated browser with no errors, and the layout was checked at nine screen sizes. The 3D scenes could not be displayed in that environment and were only checked for errors.
- Still to be checked by the team: the fluid constants and references against their sources, and a run of the CoolProp option.
