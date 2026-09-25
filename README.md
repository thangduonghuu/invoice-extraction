# Insta Quote AI — invoice line-item extraction with evidence and refusals

Upload a PDF invoice, get back line items where every number is traced to the exact text it came from — or an explicit refusal instead of a guess. The hard rule: never output a number you can't point to a source for. Refusing to extract something is a correct result; guessing is not.

Live app: https://main.d2b3bngeytlntg.amplifyapp.com/

**What was the hardest decision, and why did you choose that way?**

- I considered three approaches to reading the invoice: OCR, calling an LLM API, or reading the PDF's text layer directly. I chose the text layer because every extracted number has to be traceable to the exact source text it came from the text layer gives the real, verbatim characters from the PDF, while OCR and an LLM would only be a best guess at what's on the page. It's also the lowest-cost and fastest option, and the 6 sample invoices are all text-based (not scanned images), so it was a good fit.

**Where are you not confident?**

- Section-title detection (which document type a page is — "Tax Invoice", "Statement Summary", etc.) is a fixed-position rule: it just reads the 2nd line on the page, it doesn't look at the actual wording. It's only verified against the 6 sample invoices, which all use the same 2-line letterhead — an invoice with a 1-line or 3-line letterhead would break it.

- Column-header detection (finding the Description/Qty/Unit Price/Amount row) is more robust — it matches known keywords by regex, not a fixed position — but it's still only tested against these 6 layouts, so unusual header wording or merged/split header cells in a different invoice could cause it to miss a column.

**What would you do with three more days?**

- Consider calling an LLM API to support a wider variety of invoice formats.

- Consider a more robust solution for the section-title detection than the current fixed "2nd line on the page" heuristic, so it generalizes beyond the 6 sample invoices' shared letterhead template.

- Force a real failure through the queue (3 failed deliveries) against the deployed app to confirm the dead-letter-queue path actually marks a job as failed end to end right now that path is only covered by a unit test, not tested live.

- Broaden column-header detection to handle merged/split header cells and a wider vocabulary of header wording, instead of relying on a fixed list of known keywords.
