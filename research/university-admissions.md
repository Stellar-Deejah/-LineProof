# University Admissions Research

## Market Analysis

University admissions involve:
- Undergraduate programs (most competitive)
- Graduate programs
- Professional schools (law, medicine, business)
- International student quotas

Waitlists are common for selective institutions:
- Ivy League and top-tier universities
- Liberal arts colleges with low acceptance rates
- University-specific programs (honors, scholarships)

## Key Pain Points

### Lack of Transparency
- No insight into waitlist mechanics
- Subjective "interest indicators"
- No verification of treatment fairness

### Student Anxiety
- Constant uncertainty about status
- No reliable communication channel
- No recourse for suspected unfairness

### Administrative Burden
- Manual waitlist management
- Document tracking for each student
- Communication overhead

## LineProof Opportunities

### Fair Waitlist Management
- FIFO or lottery-based advancement
- Public verification of status changes
- Reduction in perceived favoritism

### Student Experience
- Self-service status lookup
- Automated advancement notifications
- Confidence in process integrity

### Institutional Benefits
- Reduced admissions office inquiries
- Improved public perception
- Audit trail for accreditation

## Technical Considerations

### Identity Verification
- Link to application ID or student ID
- Integration with Common App or institutional portals
- Prevent duplicate applications

### Privacy
- FERPA compliance (US student privacy law)
- Optional anonymity for certain pools
- De-identification for public statistics

### Integration Points
- Student portal authentication
- Email/SMS notification system
- Admissions management dashboard

---

## Concrete Technical Requirements

### 1. FERPA & GDPR De-Identified Hash Preservation
- Public queue queries (`GET /public/queues`) and on-chain logs must reference cryptographic hashes of Common App / Institutional Student IDs.
- Student PII (name, SSN, GPA) is stored strictly off-chain in compliance with FERPA (US) and GDPR (EU) regulations.

### 2. Multi-Category Quota Pool Partitioning
- Admissions offices configure separate waitlist pools (e.g. In-State, Out-of-State, International, Departmental Honors) as distinct queue instances under `lineproof-queue-factory`.
- Each pool maintains independent capacity bounds (`max_positions`) and advancement rules.

### 3. Tuition Deposit Escrow & Acceptance Settlement
- Applicants offered waitlist advancement post a commitment deposit via `lineproof-escrow::deposit`.
- Accepting admission executes `lineproof-escrow::release` to the university bursar; declining or expiring triggers `lineproof-escrow::refund` and automatically promotes the next applicant.

### 4. Accreditation & Administrative Audit Verification
- All waitlist status changes generate immutable Soroban contract events (`lineproof_queue`, `lineproof_enrollment`).
- Admissions compliance officers can export cryptographic proofs demonstrating zero unauthorized queue-skipping during higher-education accreditation audits.

### 5. Slate / Banner / Workday SIS Integration API
- Backend API (`/api/v1/enrollments`) integrates with university Student Information Systems (SIS) via OAuth2 and mTLS connections.
- Enables real-time synchronization between portal decision releases and Soroban contract advancements.