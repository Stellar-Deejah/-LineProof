# Healthcare Waitlists Research

## Market Analysis

Healthcare systems worldwide manage waiting lists for:
- Specialist appointments (dermatology, orthopedics, mental health)
- Surgical procedures
- Diagnostic imaging
- Therapy sessions

## Key Pain Points

### Administrative Overhead
- Manual prioritization and slot allocation
- Phone-based queue management
- Limited visibility into actual wait times

### Fairness Issues
- Patients may skip ahead through connections
- No public accountability for wait time estimates
- Inconsistent prioritization across providers

### Compliance Requirements
- HIPAA privacy considerations
- Medical ethics board oversight
- Public health transparency mandates

## LineProof Opportunities

### Priority Integration
- Encode medical priority levels on-chain
- Configure advancement rules (urgency-based, FIFO, lottery)
- Audit trail for compliance reporting

### Patient Experience
- SMS/email notifications on queue advancement
- Self-service position lookup
- Confidence in fair treatment

### Provider Benefits
- Reduced administrative burden
- Improved patient satisfaction scores
- Compliance-ready audit logs

## Technical Considerations

### Identity Verification
- Link to patient medical record numbers (de-identified)
- Integration with existing patient portals
- Support for family/dependents linking

### Privacy
- Queue slugs should not contain PHI
- On-chain data is public; use encrypted references
- Consider off-chain storage with on-chain commitments

### Integration Points
- EHR system APIs for patient data
- SMS gateway for notifications
- Staff portal for admin operations

---

## Concrete Technical Requirements

### 1. HIPAA / PHI Compliance & Zero-Knowledge Hashing
- On-chain queue storage must strictly exclude Protected Health Information (PHI).
- Patient records are identified using salted SHA256 hashes of Medical Record Numbers (MRN) or zero-knowledge identity commitments (`lineproof-identity::bind`), stored off-chain in encrypted FHIR vaults.

### 2. Clinical Urgency Priority Tiers (Triage Levels 1–5)
- Advancement rules must support priority weighting (`AdvancementRule::PriorityTier`) reflecting clinical urgency (e.g. emergency triage level vs routine checkup).
- Positions are advanced deterministically based on validated clinical urgency weight combined with enrollment timestamp.

### 3. Regulatory Audit Trail & Event Immutability
- Every lifecycle event (`Enrolled`, `Advanced`, `Expired`, `Cancelled`) must emit Soroban contract events (`lineproof_queue`, `lineproof_enrollment`) with on-chain ledger timestamps.
- These cryptographic event logs provide compliance evidence required by medical ethics boards and HIPAA compliance auditors.

### 4. EHR / HL7 / FHIR Integration Gateway
- Backend integration service must expose HL7 FHIR R4 compatible hooks (`Patient`, `Appointment` resources).
- Queue position advancement triggers automated webhooks to EHR systems and SMS notification gateways (e.g. Twilio) within 3 seconds of ledger finality.

### 5. Patient Non-Transferability & Anti-Broker Enforcement
- Non-transferability invariants (`lineproof-identity::can_transfer == false`) prevent predatory third-party slot brokers from buying and reselling specialist medical appointments.