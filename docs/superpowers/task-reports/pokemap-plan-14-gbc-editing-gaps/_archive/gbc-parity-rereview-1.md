**Important: ADDRESSED.** Both builders skip validation for unchanged copied text after CRLF normalization. Edited text ignores brace segments; GBC strips trailing `@`; original-width measurement tolerates unsupported characters. Regression tests cover these paths and retain edited-text refusals.

No new Critical/Important/Minor findings. Existing Minor (`next` excluded) remains deferred as requested.

Reviewed code and tests; supplied test/mutation evidence was not rerun. Earlier report was absent from this worktree; used your stated findings.