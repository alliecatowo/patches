## 2025-05-18 - Standardized Button component for inline forms

**Learning:** Raw HTML `<button>` elements in interactive web forms miss design token styles and loading states, leading to sudden layout shifts or lack of feedback during mutation pending states.
**Action:** Replace inline form submit/cancel `<button>` controls with `apps/web/src/components/ui/Button.tsx` (`variant="primary"` / `variant="ghost"`) and pass `loading={mutation.isPending}` to provide clear accessible visual feedback.
