# Hackathon Technical Disclosure & Compliance Document

## Team Information
- **Team Name**:
- **Project Title**:
- **Problem Statement / Track**:
- **Team Members**:
- **Repository Link (if public)**:
- **Deployment Link (if applicable)**:

---
make a dot in square brackets for selection 

## 1. APIs & External Services Used

For **each API / external service**, teams must clearly specify the following:

### API / Service Entry
- **API / Service Name**:
- **Provider / Organization**:
- **Purpose in Project**:
- **API Type**:
  - [ ] REST
  - [ ] GraphQL
  - [ ] SDK
  - [ ] Other (specify)
- **License Type**:
  - [ ] Open Source
  - [ ] Free Tier
  - [ ] Academic
  - [ ] Commercial
- **License Link / Documentation URL**:
- **Rate Limits (if any)**:
- **Commercial Use Allowed**:
  - [ ] Yes
  - [ ] No
  - [ ] Unclear

> Repeat this section for every API or external service used.

---

## 2. API Keys & Credentials Declaration

Teams **must disclose how API keys or credentials are obtained and handled**.

- **API Key Source**:
  - [ ] Self-generated from official provider
  - [ ] Hackathon-provided key
  - [ ] Open / Keyless API
- **Key Storage Method**:
  - [ ] Environment Variables
  - [ ] Secure Vault
  - [ ] Backend-only (not exposed)
- **Hardcoded in Repository**:
  - [ ] Yes 
  - [ ] No 

 **Hardcoding API keys in public repositories will lead to disqualification.**

---

## 3. Open Source Libraries & Frameworks

List **all major libraries, frameworks, and SDKs** used.

| Name | Version | Purpose | License |
|------|---------|---------|---------|
| Example: React | 18.x | Frontend UI | MIT |


---

## 4. AI Models, Tools & Agents Used

Teams must **explicitly disclose all AI usage**.

### AI Models
- **Model Name**:
- **Provider**:
- **Used For** (e.g., summarization, vision, code generation):
- **Access Method**:
  - [ ] API
  - [ ] Local Model
  - [ ] Hosted Platform

### AI Tools / Platforms
- **Tool Name**:
- **Role in Project**:
- **Level of Dependency**:
  - [ ] Assistive
  - [ ] Core Logic
  - [ ] Entire Solution

---

## 5. AI Agent Usage Declaration (IMPORTANT)

The following must be declared clearly:

- **AI Agents Used** (if any):
  - [ ] None
  - [ ] Yes (list below)

### If Yes:
- **Agent Name / Platform**:
- **Capabilities Used**:
  - [ ] Code generation
  - [ ] Full app scaffolding
  - [ ] Decision making
  - [ ] Autonomous workflows
- **Human Intervention Level**:
  - [ ] High (manual design & logic)
  - [ ] Medium
  - [ ] Low (mostly autonomous)

---

## 6. Restricted / Discouraged AI Services

To preserve **originality, creativity, and fair competition**, the following restrictions apply:

### Disallowed
- Fully autonomous platforms that:
  - Generate **entire applications end-to-end**
  - Make architectural decisions without human reasoning
  - Auto-generate UI + backend + deployment with minimal input

### Restricted (Must Be Declared & Justified)
Examples include but are not limited to:
- Emergent-style autonomous app builders
- Full-stack auto-generation agents
- Prompt-to-product systems

Usage is allowed **only if**:
- Core logic is human-designed
- AI is used as an **assistant**, not a replacement
- Teams can clearly explain architecture & decisions

Failure to justify usage may impact **innovation and originality scores**.

---

## 7. Originality & Human Contribution Statement

Briefly explain:
- What parts were **designed and implemented by humans**
- What parts were **assisted by AI**
- What makes your solution **unique**

---

## 8. Ethical, Legal & Compliance Checklist

- [ ] No copyrighted data used without permission
- [ ] No leaked or private datasets
- [ ] API usage complies with provider TOS
- [ ] No malicious automation or scraping
- [ ] No AI-generated plagiarism

---

## 9. Final Declaration

> We confirm that all information provided above is accurate.  
> We understand that misrepresentation may lead to disqualification.

**Team Representative Name**:  


---