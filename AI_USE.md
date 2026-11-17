# AI-use disclosure

An AI assistant (Claude, by Anthropic, used through the Claude app) was used extensively in THERMOSCOPE.

What it did, under the direction of the project team:

- Wrote the Python package in `src/thermoscope/` (dataset generation, experiments, export) and the tests.
- Wrote the website in `docs/` (HTML, CSS, JavaScript numerics and 3D scenes).
- Drafted the explanatory text on the website and this repository's documentation.
- Ran the pipeline and the tests in a sandbox, and debugged both.
- Supplied the fluid constants (critical temperature, critical pressure, acentric factor) and the
  bibliographic references from its knowledge of standard sources.

What that means for a reader:

- The numerical results are outputs of the code in this repository. They can be regenerated with
  `python -m thermoscope.run` and are not text produced by the model.
- The fluid constants and reference details should be checked against the cited sources.
- The published results use the Peng-Robinson backend, because CoolProp could not be installed in the
  sandbox where the assistant ran the pipeline. The CoolProp backend in `dataset.py` was written but never
  executed there; treat it as untested until it has been run locally.
- The 3D scenes were written without being rendered in that sandbox (the 3D library could not be loaded
  there); they were checked for runtime errors against a stand-in only.
- The team is responsible for verifying the work and for the conclusions.
