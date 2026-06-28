#let publication(title: "Simulation", subtitle: "", body) = {
  set document(title: title, author: "AutoNateAI")
  set page(paper: "us-letter", margin: (x: 0.72in, top: 0.75in, bottom: 0.72in), footer: context [
    #set text(size: 8pt, fill: rgb("52615d"))
    AutoNateAI · Sim Lab #h(1fr) #counter(page).display()
  ])
  set text(font: "Helvetica Neue", size: 10.2pt, fill: rgb("14212b"))
  set par(leading: 0.72em)
  show heading.where(level: 1): it => block(above: 1.2em, below: 0.7em)[#set text(size: 21pt, weight: "bold", fill: rgb("006e55")); #it.body]
  show heading.where(level: 2): it => block(above: 1em, below: 0.5em)[#set text(size: 15pt, weight: "bold"); #it.body]
  show heading.where(level: 3): it => block(above: .8em, below: .4em)[#set text(size: 12pt, weight: "bold"); #it.body]
  show raw: it => box(fill: rgb("f2f6f4"), inset: 7pt, radius: 2pt, it)
  show table: set table(stroke: rgb("d7dfdc"), inset: 6pt)
  block(fill: rgb("0a1110"), inset: 24pt, width: 100%, radius: 3pt)[
    #text(size: 9pt, weight: "bold", fill: rgb("5ee6b8"), tracking: 1pt)[SIM LAB · AUTONATEAI]
    #v(16pt)
    #text(size: 28pt, weight: "bold", fill: white)[#title]
    #v(7pt)
    #text(size: 12pt, fill: rgb("a2b3ae"))[#subtitle]
  ]
  v(22pt)
  body
}
