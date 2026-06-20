# Estimated Cost Sheet

This context defines the business language for project cost estimation, quotation preparation, CRM integration, and approval tracking.

## Language

**Estimated Cost Sheet**:
The internal project-costing document that owns cost calculation, margin analysis, approval state, and the calculation snapshot used before a quotation is issued.
_Avoid_: Quote, CRM deal, opportunity

**Customer**:
The organization that buys or may buy a project. CRM is the source of truth for Customer identity and profile data.
_Avoid_: Client, account, buyer

**Quotation**:
The commercial offer prepared from an Estimated Cost Sheet for a Customer. The Estimated Cost Sheet owns quotation preparation until it is synced or represented in CRM.
_Avoid_: Estimate, proposal, cost sheet

**CRM Reference**:
The external identifier that links an Estimated Cost Sheet record to the matching CRM record for sync and traceability.
_Avoid_: Local ID, document number

**Approval Log**:
The immutable business record of who reviewed or decided on an Estimated Cost Sheet and when.
_Avoid_: Comment thread, status history
