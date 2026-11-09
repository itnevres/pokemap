Added document-level Escape handling to Add and Save, respecting topmost ownership, `defaultPrevented`, and in-flight requests. Added a cancellable focus recheck after pointer processing; focus restoration remains intact.

New StrictMode tests, both families:

- `StrictMode loading focus repairs the canvas default-focus steal and restores the Add opener`
- `StrictMode loading Add owns document Escape from body and honors a child-consumed Escape`
- `StrictMode stacked Save owns body Escape without closing the loading Add dialog`
- `StrictMode creating Add consumes body Escape without canceling the deferred create`

CRLF/no-BOM audit passed; `indicator/at` mock preserved. Tests, git, and live verification were not run.