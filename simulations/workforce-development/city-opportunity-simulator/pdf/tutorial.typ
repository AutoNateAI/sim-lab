#import "theme.typ": publication
#show: publication.with(
  title: "Find the Workforce Pipeline Bottleneck",
  subtitle: "Simulation tutorial and reproducibility guide",
)

= Follow Along: Find the Workforce Pipeline Bottleneck
<follow-along-find-the-workforce-pipeline-bottleneck>
Workforce funding does not move straight into jobs. It passes through a chain of resident awareness, enrollment, completion, and employer demand. You will run three controlled experiments to find which part of that chain limits this model.

== The goal
<the-goal>
Learn to change one assumption at a time, read the state trajectories, and distinguish a training-capacity problem from an employer-demand problem.

== 1. Establish the baseline
<1-establish-the-baseline>
Open the #link("./index.mdx")[interactive model] and select #strong[Reset model]. The fixed seed means the baseline will be identical every time.

Record these four outputs:

#box(image("assets/01-baseline-simulation.png", alt: "Baseline City Opportunity Simulator with the default controls and sixteen-week outcome chart"))

#figure(
  align(center)[#table(
    columns: 2,
    align: (auto,auto,),
    table.header([Measure], [What it tells you],),
    table.hline(),
    [Residents reached], [Whether information entered the community],
    [Completed training], [Whether capacity became skill],
    [Employed], [Whether trained residents found openings],
    [Budget remaining], [Whether money or another constraint stopped progress],
  )]
  , kind: table
  )

== 2. Test outreach
<2-test-outreach>
Move #strong[Weekly outreach] from 8% to 16%. Leave every other control unchanged.

If awareness rises without a similar employment increase, outreach was not the final bottleneck. The additional residents still have to pass through finite training seats and job openings.

== 3. Test training capacity
<3-test-training-capacity>
Reset the model. Move #strong[Training seats] from 36 to 72.

Watch the orange "In training" line and the purple "Trained" line. A seat is a concurrent slot, so one slot may serve multiple residents across the 16-week run after earlier trainees finish.

#box(image("assets/02-expanded-training.png", alt: "Expanded training run with 72 seats, 148 completions, and 90 residents employed"))

In this seeded run, doubling seats raised completed training from 131 to 148 while employment moved only from 88 to 90. Capacity produced more trained residents, but the 90 available openings became the next constraint.

== 4. Test employer demand
<4-test-employer-demand>
Keep 72 training seats and move #strong[Employer openings] from 90 to 160. If employment barely changes, openings were already sufficient. If it rises, the earlier run was demand-constrained.

== 5. Make a defensible claim
<5-make-a-defensible-claim>
Write your result in this form:

#quote(block: true)[
In this synthetic run, changing #strong[\[one input\]] from #strong[\[old value\]] to #strong[\[new value\]] changed #strong[\[one output\]] from #strong[\[old result\]] to #strong[\[new result\]], while the seed and other assumptions stayed fixed.
]

This wording separates model evidence from claims about a real city.

== Debug order
<debug-order>
+ Confirm the seed and all four controls.
+ Reset before beginning a new comparison.
+ Change only one control.
+ Check whether budget reached zero.
+ Inspect awareness, training, trained, then employed---in that order.
+ Read the #link("./odd.md#known-limitations")[ODD limitations] before generalizing.

== What you learned
<what-you-learned>
You treated a public program as a connected system rather than a budget line. You also ran a controlled simulation experiment: one changed assumption, a fixed random seed, observable outputs, and a bounded conclusion.

