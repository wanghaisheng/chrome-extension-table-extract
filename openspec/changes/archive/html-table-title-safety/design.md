<!-- input: DOM traversal loop safety -->
<!-- output: design notes + constraints -->
<!-- pos: change packet design (Gate B) -->
# Design: HTML table title extraction safety

## Problem

The table title logic tries to find a nearby heading/caption by walking up the DOM when:

- title is empty, or
- title starts with `.`

On some pages, that can lead to a long traversal and potentially never terminate if invariants are broken.

## Decision: bounded traversal

- add a `safety` counter
- require `scrapElement` to be non-null
- stop after `50` iterations

Rationale:

- keeps runtime bounded with minimal behavioral change
- 50 is large enough to reach typical container hierarchies but prevents pathological loops

## Tradeoffs

- In rare pages where the title is only found beyond 50 ancestors, the title may remain empty; this is acceptable compared to hanging the popup.

