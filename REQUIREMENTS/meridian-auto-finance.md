# Meridian Auto Finance

## Customer Metadata

- **Name:** Meridian Auto Finance, Inc.
- **Slug:** meridian-auto-finance
- **Industry:** Regional auto lending (prime + near-prime indirect)
- **Active accounts:** ~80,000 active loan accounts
- **Primary contact:** Dana Ortiz, VP Portfolio Risk (dana.ortiz@meridianauto.example)
- **Account executive:** Priya Shah (internal)
- **Contract effective date:** 2026-04-15
- **Go-live target:** 2026-05-29 (4 weeks from kickoff)

## Original Spec

Meridian wants a monthly portfolio-monitoring product over their full active
book. Their stated requirements (verbatim, lightly cleaned):

- Monitor all 80,000 active borrowers monthly.
- Flag any borrower whose FICO score drops by 40+ points **OR** falls below 620.
- Flag any borrower with a new 30+ day delinquency on any tradeline.
- Flag any borrower with a new bankruptcy or repossession.
- Deliver flagged accounts as a CSV containing: account ID, current score,
  prior score, score delta, triggered criteria, and a timestamp.
- Delivery channel: SFTP drop to Meridian's dropbox.
- SLA: file must land by the 5th of each month.
- Live in 4 weeks.

## Contract Notes

- Standard portfolio-monitoring rate card; no custom pricing.
- Meridian represents that all accounts in the monitoring file are existing
  loans on which they hold a credit obligation. Permissible-purpose attestation
  is captured at the master agreement level (Account Review).
- Audit rights: Meridian may request our SOC 2 Type II annually.
- Data minimization clause: bureau will deliver only fields enumerated in the
  signed Statement of Work.
- Reseller restriction: Meridian may not redistribute bureau-sourced data to
  third parties without written consent.

## Sales Handoff Notes

Color from Priya (AE):

- Dana is technical (former data engineer) and will push back on anything that
  feels like over-engineering. Wants a straight CSV, not JSON, not Parquet.
- Meridian's existing SFTP dropbox is hosted by their managed-services partner
  CoreServ. Credentials will be issued by CoreServ; we do not own that channel.
- Meridian's compliance team is **lean** — one part-time consultant. They have
  not raised FCRA permissible-purpose, adverse-action, retention, PII handling,
  or consent-language questions during sales conversations. Sales suspects they
  have not thought through:
  - FCRA permissible purpose declaration (Account Review §604(a)(3)(F))
  - Consent / disclosure language verification on the underlying loan
    application before re-pulling
  - Data retention policy for the monthly snapshot files
  - Adverse action notice responsibility — if Meridian acts on a flag, who
    issues the notice and on whose data?
  - PII handling: full SSN vs last-4 in the file, encryption at rest and in
    transit on Meridian's side
  - Reseller restrictions — Dana mentioned an analytics vendor that "might want
    to look at the file"; this is exactly the redistribution case the contract
    forbids
- Dana mentioned wanting "month-over-month" deltas, which implies we need to
  retain the prior month's snapshot. This was not in the written spec.
- The 4-week go-live is aggressive. AE believes 6 weeks is realistic if
  Meridian needs to update consent language on their loan application.
