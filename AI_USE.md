## What we did

- Chose the research question: whether regularised regression and kernel methods can accurately predict thermodynamic residual properties and classify fluid phases across a generalised reduced space.
- Explored the problem and thermodynamic concepts ourselves first, to understand the dataset, the physical variables and the relationships between them before using AI.
- Defined the problem setup, including the three input variables (reduced temperature, reduced pressure and acentric factor), the thermodynamic properties to predict, and the three phase categories (vapour, liquid and supercritical).
- Decided which model families to compare and which experiments to run, including linear regression, OLS, Ridge and Lasso for regression, logistic regression and RBF SVM for classification, along with polynomial features up to degree five.
- Worked out the evaluation strategy, including splitting the data by fluid rather than by individual rows, keeping five fluids as a completely unseen test set, and using grouped five-fold cross-validation on the training fluids.
- Carried out all the experimental work ourselves, including dataset generation, preprocessing, notebook executions, model training, cross-validation, hyperparameter tuning, validation, final testing and additional experiments. We also analysed the results, investigated errors and handled practical problems during the experiments.
- Decided which additional investigations were important, including extrapolation in acentric factor, row-wise splitting, saturation guard-band sensitivity, Gram matrix condition numbers, scaling effects and industrial cost analysis.
- Reviewed the code and explanations, asked for corrections wherever something was unclear or incorrect, checked the results and tested the website section by section.

## What Claude did

- Wrote most of the code, including the Python data-generation and training pipeline, preprocessing, model implementation, evaluation functions and result-export functionality.
- Designed and implemented most of the website's layout and interactive components, including the 3D visualisations, prediction studio, model comparison sections and interactive learning tools.
- Wrote most of the explanatory text on the website, including the mathematical explanations, methodology, model descriptions, interpretation of results and limitations.
- Prepared most of the project documentation, including the README, setup instructions, pipeline documentation, reproducibility instructions and AI-use documentation.
- Proposed implementation approaches and helped structure parts of the code and experiments.
- Reviewed the code for potential bugs and implementation errors, and helped identify and correct issues before and during the experimental work.

## What AI did not do

- The AI did not choose the research question, the overall project objectives or the experiments we wanted to conduct.
- The AI did not carry out the actual experimental runs. We executed the data-generation pipeline, ran the notebooks, trained and evaluated the models, performed cross-validation and hyperparameter tuning, and obtained the final results ourselves.
- The AI did not manually invent, estimate or insert any of the reported numerical results. Every reported number was obtained by executing the project pipeline and analysing its outputs.
- The AI did not independently decide the final evaluation methodology. The data split by fluid, the five unseen test fluids and the grouped cross-validation strategy were decisions made by us.
- The AI did not manually manipulate the thermodynamic observations to obtain better results. The dataset was generated using the Peng-Robinson equation of state through the implemented pipeline.
- The AI did not use CoolProp to generate the reported results. Although a CoolProp option exists in the code, it could not be installed in the execution environment, so all reported results are based on the Peng-Robinson equation of state.

## How the work was checked

- **Data leakage:** We used a split by fluid, with 17 fluids for training and five completely unseen fluids reserved for final testing. The test fluids were not used during training or hyperparameter tuning.
- **Correctness:** The repository contains 11 automated tests covering important aspects of the pipeline, including correct fluid grouping, prevention of data leakage and consistency between computed results and exported outputs.
- **Results:** We checked the numerical outputs produced by our experimental runs and evaluated the final models on the five unseen fluids using the specified regression and classification metrics.
- **Reproducibility:** All numerical results are exported as CSV and JSON files. The code, notebooks and instructions required to reproduce the experiments are available in the GitHub repository.
- **The website:** We reviewed and tested every section to check the explanations, mathematical content, interactive components, visualisations and presentation of results.
